import "server-only";

// Простой rate-limit в памяти процесса — этого достаточно для одного
// инстанса (наш self-hosted деплой). При масштабировании на несколько
// инстансов нужен общий стор (Redis и т.п.), см. также src/auth.ts.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function clearRateLimit(key: string): void {
  buckets.delete(key);
}
