#!/usr/bin/env bash
# Обновление сервиса на сервере. Запускать из /opt/app:  ./deploy.sh
#
# set -e - остановиться на первой же ошибке. Без этого скрипт бодро
# продолжит работу после неудачной сборки и снесёт рабочую версию.
set -e

cd "$(dirname "$0")"

echo "==> Бэкап базы"
if [ -f data/app.db ]; then
  mkdir -p backups
  cp data/app.db "backups/app-$(date +%F-%H%M%S).db"
  # Держим последние 20 копий, остальные удаляем.
  ls -1t backups/app-*.db | tail -n +21 | xargs -r rm --
  echo "    готово"
else
  echo "    базы ещё нет, пропускаю"
fi

echo "==> Забираю изменения"
git pull

echo "==> Пересобираю"
docker compose up -d --build

echo "==> Жду, пока поднимется"
for i in $(seq 1 30); do
  if curl -sf -o /dev/null http://127.0.0.1:3000; then
    echo ""
    echo "Готово. Сервис отвечает."
    exit 0
  fi
  sleep 2
done

echo ""
echo "Сервис не ответил за минуту. Смотри логи:"
echo "  docker compose logs --tail 100"
exit 1
