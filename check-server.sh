#!/usr/bin/env bash
# Осмотр сервера: что готово, чего не хватает, что настроено неправильно.
# Запускать на сервере из папки проекта:  ./check-server.sh
#
# Ничего не меняет - только смотрит и рассказывает. Запускать можно
# сколько угодно раз. Вывод можно целиком показать Claude: там всё,
# что нужно, чтобы понять состояние машины.
#
# Секреты не печатаются. Проверяется только наличие переменных,
# но не их значения - вывод безопасно копировать в переписку.

cd "$(dirname "$0")" 2>/dev/null || true

problems=0
warnings=0

ok()   { echo "  [ ok ] $1"; }
warn() { echo "  [ ?? ] $1"; warnings=$((warnings + 1)); }
bad()  { echo "  [FAIL] $1"; problems=$((problems + 1)); }
info() { echo "         $1"; }
head_() { echo; echo "$1"; echo "------------------------------"; }

have() { command -v "$1" >/dev/null 2>&1; }

# --- Система ---------------------------------------------------------------
head_ "Система"

if [ -r /etc/os-release ]; then
  . /etc/os-release
  ok "ОС: $PRETTY_NAME"
else
  warn "не удалось определить ОС"
fi

if [ -d /proc/vz ] || grep -qa container=lxc /proc/1/environ 2>/dev/null; then
  bad "похоже, это LXC-контейнер, а не виртуальная машина"
  info "Docker внутри LXC официально не поддерживается Proxmox."
  info "См. docs/07-proxmox.md - нужна VM."
else
  ok "не LXC (или определить не удалось - это нормально)"
fi

cores=$(nproc 2>/dev/null || echo "?")
ok "ядер процессора: $cores"

if have free; then
  mem_mb=$(free -m | awk '/^Mem:/{print $2}')
  if [ "${mem_mb:-0}" -lt 1800 ]; then
    warn "оперативной памяти ${mem_mb} МБ - маловато, рекомендую от 2048"
  else
    ok "оперативной памяти: ${mem_mb} МБ"
  fi
fi

if have df; then
  free_gb=$(df -BG --output=avail . 2>/dev/null | tail -1 | tr -dc '0-9')
  if [ -n "$free_gb" ] && [ "$free_gb" -lt 5 ]; then
    bad "свободно всего ${free_gb} ГБ - сборка образа может не поместиться"
  else
    ok "свободно на диске: ${free_gb:-?} ГБ"
  fi
fi

tz=$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null || echo "?")
ok "часовой пояс: $tz"
info "от него зависит, во сколько реально сработает ночной бэкап"

# --- Программы -------------------------------------------------------------
head_ "Нужные программы"

if have docker; then
  ok "docker: $(docker --version 2>/dev/null | cut -d, -f1)"
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose: $(docker compose version --short 2>/dev/null)"
  else
    bad "нет 'docker compose' - см. docs/03-deploy.md, шаг 2"
  fi
else
  bad "docker не установлен - см. docs/03-deploy.md, шаг 2"
fi

have git && ok "git: $(git --version | awk '{print $3}')" || bad "git не установлен"

if have sqlite3; then
  ok "sqlite3: $(sqlite3 --version | awk '{print $1}')"
else
  bad "sqlite3 не установлен - бэкапы будут делаться запасным способом"
  info "Поставь:  apt install -y sqlite3"
fi

have curl && ok "curl есть" || warn "curl не установлен, часть проверок пропущу"

# --- Настройки -------------------------------------------------------------
head_ "Настройки (.env)"

if [ ! -f .env ]; then
  bad "файла .env нет - скопируй: cp .env.example .env"
else
  ok "файл .env на месте"

  # Значения НЕ печатаем - только факт наличия.
  val() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }

  [ -n "$(val SESSION_SECRET)" ] && ok "SESSION_SECRET задан" \
    || bad "SESSION_SECRET пустой - сессии работать не будут"

  app_url=$(val APP_URL)
  case "$app_url" in
    https://*) ok "APP_URL на https" ;;
    http://localhost*|http://127.*) warn "APP_URL=$app_url - для боевого сервера нужен https://твой-домен" ;;
    "") bad "APP_URL не задан" ;;
    *) warn "APP_URL=$app_url - без https ЮKassa не примет вебхуки" ;;
  esac

  provider=$(val LLM_PROVIDER)
  case "$provider" in
    mock) warn "LLM_PROVIDER=mock - тексты будут заглушкой, не настоящими" ;;
    anthropic) [ -n "$(val ANTHROPIC_API_KEY)" ] && ok "LLM_PROVIDER=anthropic, ключ задан" \
                 || bad "LLM_PROVIDER=anthropic, но ANTHROPIC_API_KEY пустой" ;;
    openai-compatible)
      if [ -n "$(val LLM_BASE_URL)" ] && [ -n "$(val LLM_API_KEY)" ] && [ -n "$(val LLM_MODEL)" ]; then
        ok "LLM_PROVIDER=openai-compatible, все три значения заданы"
      else
        bad "LLM_PROVIDER=openai-compatible, но не хватает LLM_BASE_URL / LLM_API_KEY / LLM_MODEL"
      fi ;;
    "") bad "LLM_PROVIDER не задан" ;;
    *) bad "LLM_PROVIDER=$provider - такого варианта нет" ;;
  esac

  if [ -n "$(val YOOKASSA_SHOP_ID)" ] && [ -n "$(val YOOKASSA_SECRET_KEY)" ]; then
    ok "ключи ЮKassa заданы - приём оплаты включён"
    [ "$(val YOOKASSA_VERIFY_IP)" = "false" ] \
      && bad "YOOKASSA_VERIFY_IP=false на боевом сервере - верни true" \
      || ok "проверка адресов ЮKassa включена"
  else
    warn "ключи ЮKassa не заданы - оплата пока не работает (это нормально до docs/04)"
  fi
fi

if git check-ignore -q .env 2>/dev/null; then
  ok ".env исключён из git"
else
  bad ".env НЕ исключён из git - ключи могут утечь в репозиторий"
fi

# --- Приложение ------------------------------------------------------------
head_ "Приложение"

if have docker && docker compose ps 2>/dev/null | grep -q "Up\|running"; then
  ok "контейнер запущен"
else
  warn "контейнер не запущен (docker compose up -d --build)"
fi

if have curl; then
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://127.0.0.1:3000 2>/dev/null)
  [ "$code" = "200" ] && ok "приложение отвечает на порту 3000" \
    || bad "приложение не отвечает на 127.0.0.1:3000 (код: ${code:-нет ответа})"
fi

# --- Сеть ------------------------------------------------------------------
head_ "Сеть"

local_ip=$(hostname -I 2>/dev/null | awk '{print $1}')
[ -n "$local_ip" ] && ok "адрес машины в локальной сети: $local_ip" \
  || warn "не удалось определить локальный адрес"

if have curl; then
  ext_ip=""
  for svc in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
    ext_ip=$(curl -s --max-time 8 "$svc" 2>/dev/null | tr -d '[:space:]')
    case "$ext_ip" in [0-9]*.[0-9]*.[0-9]*.[0-9]*) break ;; *) ext_ip="" ;; esac
  done

  if [ -n "$ext_ip" ]; then
    ok "внешний IP, каким тебя видит интернет: $ext_ip"
    info "Открой панель роутера и сравни с его WAN-адресом."
    info "Совпадают - белый IP, можно пробрасывать порты (вариант А в docs/07)."
    info "Различаются - ты за NAT провайдера, нужен вариант Б (VPS + WireGuard)."
  else
    warn "внешний IP определить не удалось (нет интернета или сервисы недоступны)"
  fi
fi

if have ss; then
  for p in 80 443; do
    ss -ltn 2>/dev/null | grep -q ":$p " && ok "порт $p кто-то слушает" \
      || warn "порт $p никто не слушает - HTTPS ещё не настроен (Caddy)"
  done
else
  info "утилиты ss нет, порты не проверил (apt install -y iproute2)"
fi

# --- Бэкапы ----------------------------------------------------------------
head_ "Бэкапы"

if [ -x ./backup.sh ]; then
  ok "backup.sh на месте и исполняемый"
else
  bad "backup.sh отсутствует или не исполняемый (chmod +x backup.sh)"
fi

if [ -d backups ]; then
  last=$(ls -1t backups/app-*.db 2>/dev/null | head -1)
  if [ -n "$last" ]; then
    age_h=$(( ( $(date +%s) - $(stat -c %Y "$last") ) / 3600 ))
    if [ "$age_h" -gt 48 ]; then
      bad "последнему бэкапу $age_h часов - похоже, ночной бэкап не работает"
    else
      ok "последний бэкап: $last (${age_h} ч назад)"
    fi
  else
    warn "папка backups есть, но копий в ней нет"
  fi
else
  warn "бэкапов ещё не было - запусти ./backup.sh"
fi

if ! have crontab; then
  warn "команды crontab нет, расписание не проверил (apt install -y cron)"
elif crontab -l 2>/dev/null | grep -q "backup.sh"; then
  ok "ночной бэкап стоит в cron"
else
  bad "ночного бэкапа в cron нет - см. docs/03-deploy.md"
fi

if [ ! -d backups ] || [ -z "$(ls -1 backups/ 2>/dev/null)" ]; then
  :
else
  info "Не забудь: копия базы должна лежать ЕЩЁ И ВНЕ этой машины."
fi

# --- Итог ------------------------------------------------------------------
echo
echo "=================================================="
if [ "$problems" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  echo "Всё в порядке."
elif [ "$problems" -eq 0 ]; then
  echo "Критичного нет. Замечаний: $warnings."
else
  echo "Проблем: $problems. Замечаний: $warnings."
  echo "Строки [FAIL] - это то, что нужно починить в первую очередь."
fi
echo
echo "Этот вывод можно целиком показать Claude - секретов в нём нет."
