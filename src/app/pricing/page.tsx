import Header from "@/components/Header";
import Footer from "@/components/Footer";
import BuyButton from "@/components/BuyButton";
import { PLANS } from "@/lib/plans";
import { currentUser } from "@/lib/session";
import { isConfigured } from "@/lib/yookassa";

export default async function PricingPage() {
  const user = await currentUser();
  const paymentsLive = isConfigured();

  return (
    <>
      <Header />

      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Тарифы</h1>
        <p className="mt-3 text-muted">
          Одна генерация — одна карточка. Кредиты не сгорают.
        </p>

        {!paymentsLive && (
          <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Приём оплаты ещё подключается. Напиши на{" "}
            <a href="mailto:hello@example.ru" className="font-medium underline">
              hello@example.ru
            </a>{" "}
            — выдадим доступ вручную.
          </p>
        )}

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 ${
                plan.highlight ? "border-brand bg-brand-soft" : "border-line bg-paper"
              }`}
            >
              {plan.highlight && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
                  Берут чаще всего
                </p>
              )}
              <h2 className="font-semibold">{plan.title}</h2>
              <p className="mt-3 text-3xl font-bold">
                {Number(plan.priceRub).toLocaleString("ru-RU")} ₽
              </p>
              <p className="mt-1 text-sm text-muted">
                {plan.credits} карточек · {plan.perCard}
              </p>
              {plan.note && <p className="mt-3 text-sm text-muted">{plan.note}</p>}

              <BuyButton planId={plan.id} loggedIn={Boolean(user)} highlight={plan.highlight} />
            </div>
          ))}
        </div>

        <div className="mt-14 max-w-2xl">
          <h2 className="text-xl font-semibold">Частые вопросы</h2>
          <dl className="mt-5 space-y-5">
            {[
              [
                "Кредиты сгорают?",
                "Нет. Купленные генерации остаются на счёте, пока их не потратишь.",
              ],
              [
                "Можно вернуть деньги?",
                "Да, если генерациями не пользовались — вернём полностью. Напиши на почту.",
              ],
              [
                "Тексты уникальные?",
                "Каждый текст пишется под твои характеристики заново. Двух одинаковых не будет.",
              ],
              [
                "Подойдёт для других площадок?",
                "Формат заточен под Wildberries и Ozon, но текст подойдёт и для Яндекс Маркета.",
              ],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-medium">{q}</dt>
                <dd className="mt-1 text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>

      <Footer />
    </>
  );
}
