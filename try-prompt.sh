#!/usr/bin/env bash
# Настройка промпта прямо на сервере, где нет Node - только Docker.
#
#   sudo ./try-prompt.sh              все 10 товаров
#   sudo ./try-prompt.sh --only 3     только третий (быстро и дёшево)
#
# Node берётся из готового образа на время запуска и исчезает после.
# Ставить его на сервер не нужно.
#
# ВНИМАНИЕ: на настоящей модели каждый прогон - это 10 платных запросов.
# Пока привыкаешь к формату, поставь в .env LLM_PROVIDER=mock.
set -e

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker не установлен. На ноутбуке вместо этого: npm run try-prompt"
  exit 1
fi

if [ ! -f .env ]; then
  echo "Нет файла .env - сначала установка (см. README)."
  exit 1
fi

if [ ! -r .env ]; then
  echo "Не хватает прав прочитать .env. Запусти через sudo:"
  echo "    sudo ./try-prompt.sh $*"
  exit 1
fi

# Файлы отчётов должны принадлежать человеку, а не root.
# Под sudo настоящий пользователь лежит в SUDO_UID.
RUN_UID="${SUDO_UID:-$(id -u)}"
RUN_GID="${SUDO_GID:-$(id -g)}"
mkdir -p prompt-runs
chown "$RUN_UID:$RUN_GID" prompt-runs 2>/dev/null || true

PROVIDER=$(grep -E '^LLM_PROVIDER=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"' ')
echo "Провайдер из .env: ${PROVIDER:-не задан}"
if [ "$PROVIDER" != "mock" ] && [ -n "$PROVIDER" ]; then
  echo "Это настоящая модель - прогон стоит денег."
fi
# Claude работает через свой SDK, а он живёт в node_modules. На сервере
# их нет: приложение крутится в готовом образе. Без этой проверки
# получилось бы невнятное MODULE_NOT_FOUND.
if [ "$PROVIDER" = "anthropic" ] && [ ! -d node_modules/@anthropic-ai/sdk ]; then
  echo "Для Claude нужен его SDK, а в $(pwd) нет папки node_modules."
  echo
  echo "Поставить один раз (полминуты):"
  echo
  echo "    sudo docker run --rm -v $(pwd):/work -w /work node:22-slim \\"
  echo "      npm install --no-save --no-package-lock @anthropic-ai/sdk"
  echo
  echo "После этого запусти ./try-prompt.sh снова."
  echo
  echo "Для DeepSeek и OpenAI ничего ставить не надо - им SDK не нужен."
  exit 1
fi

echo

# --env-file передаёт настройки внутрь; --network host не нужен,
# обычной сети контейнера хватает для выхода в интернет.
docker run --rm \
  -v "$(pwd):/work" \
  -w /work \
  --env-file .env \
  --user "$RUN_UID:$RUN_GID" \
  node:22-slim \
  node scripts/try-prompt.ts "$@"

echo
echo "Отчёты лежат в prompt-runs/ рядом с проектом."
echo "Скачать их на ноутбук (выполнить НА НОУТБУКЕ):"
echo "    scp admin@$(hostname -I 2>/dev/null | awk '{print $1}'):$(pwd)/prompt-runs/*.txt ."
