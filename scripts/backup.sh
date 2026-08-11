#!/bin/sh
# Резервная копия базы (консистентный снапшот через sqlite3 .backup — так
# безопаснее, чем просто копировать файл базы, который может быть открыт на
# запись) и загруженных пользователями файлов. Запускать с хоста из папки,
# где лежит docker-compose.yml (например, из cron), см. DEPLOY.md.
set -e
cd "$(dirname "$0")/.."

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

docker compose exec -T app sqlite3 /app/data/prod.db ".backup '/app/backups/db-${TIMESTAMP}.db'"
docker compose exec -T app sh -c "mkdir -p /app/data/uploads && tar -czf /app/backups/uploads-${TIMESTAMP}.tar.gz -C /app/data uploads"

echo "Бэкап сохранён: backups/db-${TIMESTAMP}.db, backups/uploads-${TIMESTAMP}.tar.gz"

# Храним последние 14 бэкапов каждого вида, остальные удаляем.
ls -1t backups/db-*.db 2>/dev/null | tail -n +15 | xargs -r rm --
ls -1t backups/uploads-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --
