#!/usr/bin/env bash
# Установка сервиса на чистую виртуалку с Debian или Ubuntu.
# Запускать от root из папки проекта:
#
#   ./install-server.sh --plan    посмотреть, что скрипт собирается сделать
#   ./install-server.sh           сделать
#
# Скрипт можно запускать повторно: он не трогает то, что уже настроено,
# и никогда не перезаписывает существующий .env.
set -e

cd "$(dirname "$0")"

PLAN=0
[ "${1:-}" = "--plan" ] && PLAN=1

step()  { echo; echo "==> $1"; }
skip()  { echo "    уже сделано: $1"; }
doing() { echo "    $1"; }
have()  { command -v "$1" >/dev/null 2>&1; }

# В режиме --plan ничего не выполняем, только печатаем.
run() {
  if [ "$PLAN" = "1" ]; then
    echo "    [план] $*"
  else
    "$@"
  fi
}

# --- Проверки перед стартом -------------------------------------------------

if ! have apt-get; then
  echo "Этот скрипт рассчитан на Debian или Ubuntu (нужен apt)."
  echo "Твоя система другая - дальше делай по docs/03-deploy.md руками."
  exit 1
fi

if [ "$PLAN" = "0" ] && [ "$(id -u)" != "0" ]; then
  echo "Нужны права root: sudo ./install-server.sh"
  exit 1
fi

# Скрипт сам переходит в свою папку, так что запускать можно откуда угодно.
# Но если его скопировали отдельно от проекта - работать не с чем.
if [ ! -f package.json ] || [ ! -f docker-compose.yml ]; then
  echo "Рядом со скриптом нет файлов проекта (package.json, docker-compose.yml)."
  echo "Похоже, скрипт скопировали отдельно. Забери проект целиком:"
  echo "  git clone -b claude/vibecoding-saas-service-mx3k2z \\"
  echo "    https://github.com/IT-DO/vibe.git /opt/app"
  echo "  cd /opt/app"
  exit 1
fi

if [ "$PLAN" = "1" ]; then
  echo "РЕЖИМ ПЛАНА: ничего не меняю, только показываю, что сделал бы."
fi

# --- 1. Системные пакеты ----------------------------------------------------

step "Системные пакеты"
NEED=""
for pkg in git curl sqlite3 cron iproute2 ca-certificates; do
  case "$pkg" in
    iproute2) have ss   || NEED="$NEED $pkg" ;;
    cron)     have crontab || NEED="$NEED $pkg" ;;
    *)        have "$pkg" || NEED="$NEED $pkg" ;;
  esac
done

if [ -n "$NEED" ]; then
  doing "поставлю:$NEED"
  run apt-get update -qq
  run apt-get install -y -qq $NEED
else
  skip "все нужные пакеты на месте"
fi

# --- 2. Docker --------------------------------------------------------------

step "Docker"
if have docker && docker compose version >/dev/null 2>&1; then
  skip "docker и docker compose установлены"
else
  doing "поставлю Docker с официального скрипта get.docker.com"
  run sh -c "curl -fsSL https://get.docker.com | sh"
fi

# --- 3. Файл настроек -------------------------------------------------------

step "Настройки (.env)"
if [ -f .env ]; then
  skip ".env уже есть - не трогаю его"
  doing "если нужно поменять настройки: nano .env"
else
  doing "создам .env из .env.example"
  doing "сгенерирую SESSION_SECRET"
  doing "подставлю APP_URL с адресом этой машины"

  if [ "$PLAN" = "0" ]; then
    cp .env.example .env

    if have openssl; then
      secret=$(openssl rand -hex 32)
    else
      secret=$(od -An -tx1 -N32 /dev/urandom | tr -d ' \n')
    fi
    # Разделитель | вместо / - секрет шестнадцатеричный, слэшей в нём не будет,
    # но привычка использовать безопасный разделитель полезная.
    sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$secret|" .env

    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
    [ -n "$ip" ] && sed -i "s|^APP_URL=.*|APP_URL=http://$ip:3000|" .env

    chmod 600 .env   # читать может только root
    echo "    готово, .env создан и закрыт от посторонних (chmod 600)"
  fi
fi

# --- 4. Ночной бэкап --------------------------------------------------------

step "Ночной бэкап в 4:00"
CRON_LINE="0 4 * * * cd $(pwd) && ./backup.sh >> /var/log/kartochka-backup.log 2>&1"

if [ "$PLAN" = "1" ]; then
  echo "    [план] добавлю в crontab: $CRON_LINE"
elif crontab -l 2>/dev/null | grep -qF "backup.sh"; then
  skip "задание уже в crontab"
else
  ( crontab -l 2>/dev/null; echo "$CRON_LINE" ) | crontab -
  echo "    добавлено"
fi

# --- 5. Сборка и запуск -----------------------------------------------------

step "Сборка и запуск"
doing "первая сборка занимает несколько минут"
run docker compose up -d --build

# --- 6. Проверка ------------------------------------------------------------

if [ "$PLAN" = "1" ]; then
  echo
  echo "Это был план. Чтобы выполнить: sudo ./install-server.sh"
  exit 0
fi

step "Жду, пока сервис поднимется"
for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:3000; then
    echo "    отвечает"
    break
  fi
  [ "$i" = "30" ] && echo "    не ответил за минуту - смотри: docker compose logs --tail 50"
  sleep 2
done

step "Осмотр результата"
./check-server.sh || true

cat <<'NEXT'

──────────────────────────────────────────────────
Что дальше

1. Посмотреть сервис со своего ноутбука. Сервис намеренно не торчит
   в сеть напрямую, поэтому пробрось порт по SSH - на НОУТБУКЕ выполни:

       ssh -L 3000:127.0.0.1:3000 root@АДРЕС_ЭТОЙ_МАШИНЫ

   и открой http://localhost:3000 в браузере.

2. Включить настоящие тексты вместо заглушки:
   nano .env, поменять LLM_PROVIDER, потом ./deploy.sh

3. Домен, HTTPS и доступ снаружи - docs/07-proxmox.md,
   раздел "Как пустить пользователей внутрь".
NEXT
