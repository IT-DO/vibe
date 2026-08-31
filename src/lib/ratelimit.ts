/**
 * Простейший ограничитель частоты запросов - в памяти процесса.
 *
 * Чего он НЕ умеет: переживать перезапуск и работать на нескольких серверах.
 * Для одного сервера этого достаточно, чтобы кто-нибудь скриптом не выжрал
 * твой баланс у модели за ночь. Когда серверов станет больше - переезжай
 * на Redis, но не раньше: преждевременная инфраструктура убивает больше
 * проектов, чем нагрузка.
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) sweep(now);
    return true;
  }
  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}
