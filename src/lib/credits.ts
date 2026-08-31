import { db } from "./db";

/**
 * Всё, что меняет баланс, живёт здесь.
 *
 * Главное правило: списание и запись результата - одна транзакция.
 * Иначе однажды случится "деньги списались, а карточка не появилась",
 * и это будет самый неприятный тикет в твоей поддержке.
 */

/**
 * Пытается списать кредиты. Возвращает false, если их не хватило.
 *
 * UPDATE ... WHERE credits >= n - это атомарная проверка-и-списание.
 * Если сначала прочитать баланс, а потом списать, два одновременных
 * запроса могут увести баланс в минус.
 */
export function spendCredits(userId: number, amount: number): boolean {
  const info = db
    .prepare("UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?")
    .run(amount, userId, amount);
  return info.changes === 1;
}

export function grantCredits(userId: number, amount: number): void {
  db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(amount, userId);
}

export function getCredits(userId: number): number {
  const row = db.prepare("SELECT credits FROM users WHERE id = ?").get(userId) as
    | { credits: number }
    | undefined;
  return row?.credits ?? 0;
}

/** Списать кредит и сохранить генерацию. Либо всё, либо ничего. */
export const chargeAndRecord = db.transaction(
  (userId: number, cost: number, input: string, output: string): boolean => {
    if (!spendCredits(userId, cost)) return false;
    db.prepare("INSERT INTO generations (user_id, input, output) VALUES (?, ?, ?)").run(
      userId,
      input,
      output,
    );
    return true;
  },
);
