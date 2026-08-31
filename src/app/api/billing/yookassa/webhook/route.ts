import { db } from "@/lib/db";
import { grantCredits } from "@/lib/credits";
import { clientIp, fetchPayment, isYookassaIp, type YooPayment } from "@/lib/yookassa";

/**
 * Сюда ЮKassa сообщает, что платёж прошёл.
 *
 * Три вещи, без которых этот обработчик рано или поздно тебя подставит:
 *
 * 1. Проверка источника. Без неё любой человек может послать сюда
 *    "оплачено" и получить кредиты бесплатно.
 * 2. Перезапрос платежа в API. Тело вебхука - всего лишь подсказка
 *    "сходи посмотри". Верим только ответу API.
 * 3. Идемпотентность. ЮKassa повторяет доставку, пока не получит 200.
 *    Один и тот же платёж придёт несколько раз - начислить нужно один.
 *
 * И отдельно: почти на любую проблему отвечаем 200. Если ответить ошибкой,
 * ЮKassa будет долбиться повторами сутки. Ошибки логируем, а не возвращаем.
 */

export async function POST(request: Request) {
  if (process.env.YOOKASSA_VERIFY_IP !== "false") {
    const ip = clientIp(request.headers);
    if (!isYookassaIp(ip)) {
      console.warn("webhook: отклонён запрос с постороннего адреса", ip);
      return new Response("forbidden", { status: 403 });
    }
  }

  const body = (await request.json().catch(() => null)) as {
    event?: string;
    object?: YooPayment;
  } | null;

  const paymentId = body?.object?.id;
  if (!paymentId) return new Response("ok");

  let payment: YooPayment;
  try {
    payment = await fetchPayment(paymentId);
  } catch (error) {
    console.error("webhook: не удалось проверить платёж", paymentId, error);
    // 500 - чтобы ЮKassa повторила: тут виноваты мы или сеть, а не отправитель.
    return new Response("retry later", { status: 500 });
  }

  const known = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as
    | {
        id: string;
        user_id: number;
        credits: number;
        credits_issued: number;
      }
    | undefined;

  if (!known) {
    console.warn("webhook: платёж не найден в базе", paymentId);
    return new Response("ok");
  }

  db.prepare("UPDATE payments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    payment.status,
    paymentId,
  );

  if (payment.status !== "succeeded" || !payment.paid) {
    return new Response("ok");
  }

  // Начисление и отметка "начислено" - одной транзакцией.
  // UPDATE ... WHERE credits_issued = 0 сработает ровно один раз,
  // сколько бы одинаковых вебхуков ни пришло одновременно.
  const issue = db.transaction((): boolean => {
    const marked = db
      .prepare("UPDATE payments SET credits_issued = 1 WHERE id = ? AND credits_issued = 0")
      .run(paymentId);
    if (marked.changes !== 1) return false;
    grantCredits(known.user_id, known.credits);
    return true;
  });

  if (issue()) {
    console.log(`webhook: начислено ${known.credits} кредитов пользователю ${known.user_id}`);
  }

  return new Response("ok");
}
