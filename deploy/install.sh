#!/usr/bin/env bash
# Установка ЕГРЗ-дашборда в LXC-контейнере Proxmox (или любом Debian/Ubuntu).
#
# Что делает:
#   1. ставит python3-venv, pip, nginx (через apt);
#   2. копирует репозиторий в /opt/egrz от системного пользователя egrz;
#   3. создаёт venv и ставит пакет;
#   4. спрашивает ссылку на выгрузку и кладёт её в /opt/egrz/.env;
#   5. включает systemd-таймер ежедневного запуска;
#   6. включает nginx-сайт.
#
# Запускать из корня репозитория, от root:
#   sudo bash deploy/install.sh
#
# Скрипт идемпотентен: повторный запуск не ломает уже настроенное.

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/egrz}"
APP_USER="${APP_USER:-egrz}"
HTTP_PORT="${HTTP_PORT:-80}"
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
# data/ и .git не переносим: данные — рабочее состояние сервера,
# а не часть релиза, и переносить историю git незачем.
rsync -a --delete \
  --exclude='.git' --exclude='data' --exclude='.venv' \
  --exclude='__pycache__' --exclude='.pytest_cache' --exclude='node_modules' \
  "$REPO_ROOT"/ "$APP_DIR"/

log "Создаю виртуальное окружение и ставлю пакет…"
if [ ! -d "$APP_DIR/.venv" ]; then
  python3 -m venv "$APP_DIR/.venv"
fi
"$APP_DIR/.venv/bin/pip" install -q --upgrade pip
"$APP_DIR/.venv/bin/pip" install -q -e "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ]; then
  echo
  echo "Ссылка на выгрузку реестра выглядит так:"
  echo "  https://open-api.egrz.ru/api/PublicRegistrationBook/excelDataFile?\$orderby=ExpertiseDate desc&\$top=5000&\$skip=0"
  read -r -p "Вставьте вашу ссылку (или Enter, чтобы задать позже вручную в $APP_DIR/.env): " EXCEL_URL
  {
    echo "# Ссылка на Excel-выгрузку ЕГРЗ. Изменить можно в любой момент,"
    echo "# перезапуск таймера не требуется — файл читается при каждом запуске."
    echo "EGRZ_EXCEL_URL=${EXCEL_URL}"
  } > "$APP_DIR/.env"
fi

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
  echo "Ссылка не задана — впишите её в ${APP_DIR}/.env и выполните:"
  echo "  sudo systemctl start egrz-daily.service"
fi
