#!/usr/bin/env bash
# Проверка связи с OpenAI: пускают ли нас вообще и какие модели доступны.
# Запускать на сервере из папки проекта:
#
#   sudo ./check-llm.sh
#
# Денег не тратит: только спрашивает список моделей, генерацию не запускает.
# Ключ не печатает - вывод можно показывать кому угодно.

cd "$(dirname "$0")" 2>/dev/null || true

if [ ! -f .env ]; then
  echo "Нет файла .env - сначала установка (см. README)."
  exit 1
fi
if [ ! -r .env ]; then
  echo "Не хватает прав прочитать .env. Запусти через sudo:  sudo ./check-llm.sh"
  exit 1
fi

val() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"' '; }

KEY=$(val LLM_API_KEY)
BASE=$(val LLM_BASE_URL)
MODEL=$(val LLM_MODEL)
[ -z "$BASE" ] && BASE="https://api.openai.com/v1"

if [ -z "$KEY" ]; then
  echo "В .env пустой LLM_API_KEY. Впиши ключ и запусти снова."
  exit 1
fi

echo "Адрес API : $BASE"
echo "Ключ      : задан, ${#KEY} символов (сам ключ не печатаю)"
echo "Модель    : ${MODEL:-не задана}"
echo

echo "Спрашиваю список моделей…"
BODY=$(mktemp)
CODE=$(curl -s -o "$BODY" -w "%{http_code}" --max-time 30 \
  -H "Authorization: Bearer $KEY" "${BASE%/}/models" 2>/dev/null)

case "$CODE" in
  200)
    echo "Доступ есть. OpenAI отвечает."
    echo
    echo "Модели, доступные твоему ключу:"
    if command -v python3 >/dev/null 2>&1; then
      python3 -c "
import json,sys
try:
    ids = sorted(m['id'] for m in json.load(open('$BODY')).get('data', []))
except Exception:
    sys.exit(1)
chat = [i for i in ids if i.startswith(('gpt','o1','o3','o4','chatgpt'))]
for i in (chat or ids)[:40]:
    print('   ', i)
print()
print('Всего моделей:', len(ids))
" || grep -o '"id":"[^"]*"' "$BODY" | cut -d'"' -f4 | sort | head -40
    else
      grep -o '"id":"[^"]*"' "$BODY" | cut -d'"' -f4 | sort | head -40
    fi
    echo
    echo "Выбери одну и впиши в .env строкой LLM_MODEL=…"
    echo "Затем: ./deploy.sh"
    ;;
  401)
    echo "ОТКАЗ 401: ключ неверный или отозван."
    echo "Выпусти новый ключ в панели OpenAI и впиши в .env."
    ;;
  403)
    echo "ОТКАЗ 403. Скорее всего блокировка по стране."
    echo
    echo "Ответ OpenAI:"
    head -c 400 "$BODY"; echo
    echo
    echo "Это значит, что запросы уходят с адреса в неподдерживаемом регионе."
    echo "Варианты: выпускать трафик к OpenAI через другую страну либо"
    echo "перейти на российского провайдера моделей (LLM_PROVIDER=openai-compatible)."
    ;;
  429)
    echo "ОТКАЗ 429: превышены лимиты или закончились кредиты."
    ;;
  000)
    echo "Соединения нет вообще - OpenAI не ответил."
    echo "Или нет интернета, или адрес заблокирован на уровне сети."
    ;;
  *)
    echo "Неожиданный ответ: $CODE"
    head -c 400 "$BODY"; echo
    ;;
esac

rm -f "$BODY"
