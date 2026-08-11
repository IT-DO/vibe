#!/bin/sh
# Проверяет заполненность диска хоста и, если она выше порога, шлёт письмо
# через встроенный /api/internal/alert (переиспользует SMTP-настройки
# приложения — на хосте не нужна отдельная почтовая инфраструктура).
# Запускать с хоста, из папки с docker-compose.yml, например по cron —
# см. DEPLOY.md.
set -e
cd "$(dirname "$0")/.."

THRESHOLD=${DISK_ALERT_THRESHOLD:-85}
USAGE=$(df -P / | awk 'NR==2 { gsub("%","",$5); print $5 }')

if [ -z "$USAGE" ] || [ "$USAGE" -lt "$THRESHOLD" ]; then
  exit 0
fi

echo "Диск заполнен на ${USAGE}% (порог ${THRESHOLD}%)"

TOKEN=""
if [ -f .env ]; then
  TOKEN=$(grep -E '^INTERNAL_ALERT_TOKEN=' .env | head -n1 | cut -d= -f2- | tr -d '"')
fi

if [ -z "$TOKEN" ]; then
  echo "INTERNAL_ALERT_TOKEN не задан в .env — алерт не отправлен, только это сообщение в лог"
  exit 1
fi

curl -fsS -X POST http://localhost:3000/api/internal/alert \
  -H "Content-Type: application/json" \
  -H "X-Internal-Token: ${TOKEN}" \
  -d "{\"subject\":\"Диск заполнен на ${USAGE}%\",\"text\":\"На сервере printaukcion занято ${USAGE}% диска (порог ${THRESHOLD}%). Пора освобождать место (docker system prune -a) или увеличивать диск (pct resize).\"}" \
  || echo "Не удалось отправить алерт (curl завершился с ошибкой)"

exit 1
