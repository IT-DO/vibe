/**
 * Разбор журнала ошибок для показа в админке.
 *
 * Журнал — это склейка записей, каждая начинается со строки вида
 * `=== Падение 09.09.2026 14:31:02 (поток main) ===`. Оператору нужны
 * свежие: давние сбои он уже видел, а прокручивать килобайты стека на
 * телефоне неудобно.
 */

/** Начало записи: строка, открывающаяся тремя знаками равенства. */
const ENTRY_START = /^(?==== )/m;

/** Сколько записей в журнале. */
export function countEntries(log: string): number {
  return (log.match(/^=== /gm) ?? []).length;
}

/**
 * Последние `count` записей, склеенные обратно.
 * Пустой журнал даёт пустую строку, а не мусор.
 */
export function lastEntries(log: string, count: number): string {
  if (count <= 0) {
    return '';
  }
  const parts = log.split(ENTRY_START).filter(part => part.trim().length > 0);
  return parts.slice(-count).join('').trim();
}

/**
 * Обрезает журнал с конца до указанного размера.
 * Отправлять целиком нельзя: он может вырасти до сотни килобайт, а системное
 * «Поделиться» такие сообщения молча теряет.
 */
export function tailForSharing(log: string, maxChars = 40_000): string {
  return log.length <= maxChars ? log : log.slice(-maxChars);
}
