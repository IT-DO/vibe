#!/usr/bin/env bash
# Бэкап базы. Запускать из папки проекта:  ./backup.sh
#
# Почему не просто "cp data/app.db": база работает в режиме WAL -
# свежие записи какое-то время лежат в отдельном файле app.db-wal и
# ещё не перенесены в основной. Обычная копия основного файла в этот
# момент даёт целую, но УСТАРЕВШУЮ базу: без последних транзакций,
# а среди них может быть чей-то платёж. Потеря тихая - файл открывается,
# просто в нём нет вчерашних денег.
#
# Поэтому по порядку:
#   1) sqlite3 ".backup" - штатный горячий бэкап, безопасен на живой базе;
#   2) если sqlite3 нет - гасим сервис на пару секунд и копируем спокойно;
#   3) если и докера нет (например, на ноутбуке) - копируем все три файла.
set -e

cd "$(dirname "$0")"

DB="${DATABASE_PATH:-data/app.db}"
DIR="backups"
KEEP=20
OUT="$DIR/app-$(date +%F-%H%M%S).db"

if [ ! -f "$DB" ]; then
  echo "Базы ещё нет ($DB) - нечего сохранять."
  exit 0
fi

mkdir -p "$DIR"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT'"
  method="горячий бэкап sqlite3"
elif command -v docker >/dev/null 2>&1 && docker compose ps --quiet app 2>/dev/null | grep -q .; then
  docker compose stop app >/dev/null
  cp "$DB" "$OUT"
  docker compose start app >/dev/null
  method="с короткой остановкой сервиса"
else
  # Последний вариант. Копируем и -wal тоже, иначе потеряем свежие записи.
  cp "$DB" "$OUT"
  [ -f "$DB-wal" ] && cp "$DB-wal" "$OUT-wal"
  [ -f "$DB-shm" ] && cp "$DB-shm" "$OUT-shm"
  method="простое копирование (поставь sqlite3: apt install -y sqlite3)"
fi

# Проверяем, что получилось не битьё. Бэкап, который не открывается,
# хуже отсутствия бэкапа: он создаёт ложное спокойствие.
if command -v sqlite3 >/dev/null 2>&1; then
  if ! sqlite3 "$OUT" "PRAGMA integrity_check;" | grep -q "^ok$"; then
    echo "ОШИБКА: бэкап $OUT не проходит проверку целостности."
    exit 1
  fi
fi

# Держим последние $KEEP копий.
ls -1t "$DIR"/app-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --

echo "Готово: $OUT ($method)"
