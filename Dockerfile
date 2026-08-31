# Многослойная сборка: в итоговый образ попадает только то, что нужно
# для запуска. Без исходников, без dev-зависимостей - меньше весит,
# меньше поверхность для атаки.

FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 может собираться из исходников, если нет готовой сборки
# под эту платформу - поэтому нужны компиляторы.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV DATABASE_PATH=/data/app.db

# Не запускаем от root: если приложение взломают, злоумышленник
# получит права обычного пользователя, а не хозяина машины.
RUN groupadd -r app && useradd -r -g app app && mkdir -p /data && chown app:app /data

COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public

USER app
EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "server.js"]
