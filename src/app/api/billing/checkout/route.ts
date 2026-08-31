import { currentUser } from "@/lib/session";
import { findPlan } from "@/lib/plans";
import { createPayment, isConfigured } from "@/lib/yookassa";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Нужно войти" }, { status: 401 });

  if (!isConfigured()) {
    return Response.json(
      { error: "Приём оплаты пока не подключён. Напиши нам - выдадим доступ вручную." },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { planId?: string };
  const plan = findPlan(body.planId ?? "");
  if (!plan) return Response.json({ error: "Такого тарифа нет" }, { status: 400 });

  try {
    const payment = await createPayment({ plan, userId: user.id, userEmail: user.email });

    // Записываем платёж ДО редиректа: когда придёт вебхук, мы должны уже
    // знать про этот платёж и понимать, что он ещё не оплачен.
    db.prepare(
      `INSERT INTO payments (id, user_id, plan_id, amount_rub, credits, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    ).run(payment.id, user.id, plan.id, plan.priceRub, plan.credits, payment.status);

    const url = payment.confirmation?.confirmation_url;
    if (!url) throw new Error("ЮKassa не вернула ссылку на оплату");

    return Response.json({ url });
  } catch (error) {
    console.error("checkout failed:", error);
    return Response.json({ error: "Не удалось создать платёж. Попробуй позже." }, { status: 502 });
  }
}
