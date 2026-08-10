#!/bin/sh
set -e

npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  npx tsx prisma/seed.ts || true
fi

exec "$@"
