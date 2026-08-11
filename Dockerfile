FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl sqlite
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
VOLUME ["/app/data"]

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
