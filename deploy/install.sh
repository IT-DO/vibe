#!/usr/bin/env bash
# Установка ЕГРЗ-дашборда в LXC-контейнере Proxmox (или любом Debian/Ubuntu).
#
# Что делает:
#   1. ставит python3-venv, pip, nginx (через apt);
#   2. копирует репозиторий в /opt/egrz от системного пользователя egrz;
#   3. создаёт venv и ставит пакет;
#   4. кладёт ссылку на выгрузку в /opt/egrz/.env — по умолчанию публичный
#      адрес ЕГРЗ ниже, без диалоговых вопросов;
#   5. включает systemd-таймер ежедневного запуска;
#   6. включает nginx-сайт.
#
# Запускать из корня репозитория, от root:
#   sudo bash deploy/install.sh
#
# Своя ссылка вместо адреса по умолчанию (не для секретов — токенов в ней
# нет и быть не может, endpoint публичный):
#   EGRZ_EXCEL_URL='https://...' sudo -E bash deploy/install.sh
#
# Скрипт идемпотентен: повторный запуск не ломает уже настроенное, а если
# .env с другой ссылкой уже существует — не перезаписывает её.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/egrz}"
APP_USER="${APP_USER:-egrz}"
HTTP_PORT="${HTTP_PORT:-80}"
# Публичный, бессекретный endpoint ЕГРЗ — сортировка по дате заключения,
# 5000 последних записей. Это тот же самый адрес для всех, кто разворачивает
# проект, поэтому он захардкожен, а не спрашивается в диалоге при установке.
EGRZ_EXCEL_URL="${EGRZ_EXCEL_URL:-https://open-api.egrz.ru/api/PublicRegistrationBook/excelDataFile?\$orderby=ExpertiseDate desc&\$count=true&\$top=5000&\$skip=0}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\033[1;34m==>\033[0m %s\n' "$1"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите от root: sudo bash deploy/install.sh" >&2
  exit 1
fi

log "Устанавливаю системные пакеты (python3-venv, nginx, rsync)…"
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip nginx rsync >/dev/null

if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Создаю системного пользователя $APP_USER…"
  useradd --system --home-dir "$APP_DIR" --create-home --shell /usr/sbin/nologin "$APP_USER"
fi

log "Копирую приложение в $APP_DIR…"
mkdir -p "$APP_DIR"
# data/ и .git не переносим: данные — рабочее состояние сервера, а не часть
# релиза. .env и openssl-legacy-renegotiation.cnf тоже создаются только внутри
# APP_DIR и никогда не существуют в самом репозитории — без --exclude
# `rsync --delete` считал бы их «лишними» и удалял на каждом повторном
# запуске install.sh, стирая уже введённую ссылку на выгрузку.
rsync -a --delete \
  --exclude='.git' --exclude='data' --exclude='.venv' \
  --exclude='__pycache__' --exclude='.pytest_cache' --exclude='node_modules' \
  --exclude='/.env' --exclude='/openssl-legacy-renegotiation.cnf' \
  "$REPO_ROOT"/ "$APP_DIR"/

log "Создаю виртуальное окружение и ставлю пакет…"
if [ ! -d "$APP_DIR/.venv" ]; then
  python3 -m venv "$APP_DIR/.venv"
fi
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -e "$APP_DIR"

log "Устанавливаю обход TLS-особенности open-api.egrz.ru…"
# Сервер ЕГРЗ не поддерживает безопасное согласование TLS (RFC 5746), а
# OpenSSL 3.0+ (в этом дистрибутиве — по умолчанию) такие соединения рвёт:
# [SSL: UNSAFE_LEGACY_RENEGOTIATION_DISABLED]. Кладём готовый конфиг и
# подключаем его через OPENSSL_CONF — это единственный способ починить это
# на уровне библиотеки, в коде egrz такой проблемы нет и чинить нечего.
cp "$APP_DIR/deploy/openssl-legacy-renegotiation.cnf" "$APP_DIR/openssl-legacy-renegotiation.cnf"

if [ ! -f "$APP_DIR/.env" ]; then
  # Без диалога: ссылка публичная и одинаковая для всех, спрашивать её
  # незачем. Хотите другую — переменная EGRZ_EXCEL_URL перед запуском
  # (см. комментарий вверху файла), а не правка этого блока.
  {
    echo "# Ссылка на Excel-выгрузку ЕГРЗ. Изменить можно в любой момент,"
    echo "# перезапуск таймера не требуется — файл читается при каждом запуске."
    echo "EGRZ_EXCEL_URL=${EGRZ_EXCEL_URL}"
    echo "OPENSSL_CONF=${APP_DIR}/openssl-legacy-renegotiation.cnf"
  } > "$APP_DIR/.env"
  log "Ссылка на выгрузку записана в $APP_DIR/.env (публичный адрес ЕГРЗ по умолчанию)"
elif ! grep -q '^OPENSSL_CONF=' "$APP_DIR/.env"; then
  # .env уже существовал (например, после ручной правки или прерванной
  # установки) — дописываем недостающую строку, не трогая остальное,
  # включая уже заданную там ссылку.
  echo "OPENSSL_CONF=${APP_DIR}/openssl-legacy-renegotiation.cnf" >> "$APP_DIR/.env"
fi

# Источник истины — сам файл, а не переменная из ветки выше: при повторном
# запуске .env уже существовал, `read` не выполнялся, и без этой строки
# скрипт решил бы, что ссылки нет, хотя она есть.
EXCEL_URL="$(grep -m1 '^EGRZ_EXCEL_URL=' "$APP_DIR/.env" 2>/dev/null | cut -d= -f2-)"

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"

log "Устанавливаю systemd-таймер…"
cp "$APP_DIR/deploy/systemd/egrz-daily.service" /etc/systemd/system/
cp "$APP_DIR/deploy/systemd/egrz-daily.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now egrz-daily.timer

log "Настраиваю nginx…"
sed \
  -e "s#/opt/egrz#${APP_DIR}#g" \
  -e "s/listen 80;/listen ${HTTP_PORT};/" \
  -e "s/listen \[::\]:80;/listen [::]:${HTTP_PORT};/" \
  "$APP_DIR/deploy/nginx/egrz.conf" > /etc/nginx/sites-available/egrz.conf
ln -sf /etc/nginx/sites-available/egrz.conf /etc/nginx/sites-enabled/egrz.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx || systemctl restart nginx

echo
log "Готово."
echo "  Дашборд:        http://$(hostname -I | awk '{print $1}'):${HTTP_PORT}/"
echo "  Таймер:          systemctl status egrz-daily.timer"
echo "  Логи выгрузки:   journalctl -u egrz-daily.service -f"
echo "  Ссылка в:        ${APP_DIR}/.env"
echo

if [ -n "${EXCEL_URL:-}" ]; then
  read -r -p "Запустить первую выгрузку сейчас? [Y/n] " RUN_NOW
  if [ "${RUN_NOW:-y}" != "n" ] && [ "${RUN_NOW:-y}" != "N" ]; then
    log "Первая выгрузка (может занять несколько минут)…"
    # `systemctl start` для oneshot-юнита синхронный — ждём завершения сам.
    if systemctl start egrz-daily.service; then
      journalctl -u egrz-daily.service -n 20 --no-pager
      log "Готово. Дашборд: http://$(hostname -I | awk '{print $1}'):${HTTP_PORT}/"
    else
      echo "Выгрузка упала — подробности:" >&2
      journalctl -u egrz-daily.service -n 40 --no-pager >&2
      exit 1
    fi
  fi
else
  echo "Ссылка не задана — впишите её в ${APP_DIR}/.env (строка EGRZ_EXCEL_URL=)"
  echo "и выполните: systemctl start egrz-daily.service"
fi
