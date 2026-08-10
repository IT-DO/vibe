import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getBillingSummary } from "@/lib/billing";
import { startSubscriptionPaymentAction, payCommissionAction } from "@/lib/actions/billing";
import { isYooKassaConfigured } from "@/lib/payments/yookassa";
import { formatMoney, formatDate } from "@/lib/format";
import {
  SUBSCRIPTION_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  type SubscriptionStatus,
  type PaymentStatus,
} from "@/lib/constants";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [{ demo }, summary] = await Promise.all([searchParams, getBillingSummary(session.user.id)]);
  const demoMode = !isYooKassaConfigured();

  async function paySubscription() {
    "use server";
    await startSubscriptionPaymentAction();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Оплата</h1>
      <p className="mt-1 text-sm text-slate-500">
        Оплачивая подписку или комиссию, вы принимаете условия{" "}
        <Link href="/offer" className="text-orange-600 hover:underline">
          публичной оферты
        </Link>
        .
      </p>

      {demo === "1" && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Платёж отмечен оплаченным (демо-режим).
        </p>
      )}

      {demoMode && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Платёжный провайдер не подключён — оплата работает в демо-режиме: нажатие
          «Оплатить» сразу помечает платёж оплаченным, без реального списания денег.
          Чтобы принимать настоящие платежи, задайте <code>YOOKASSA_SHOP_ID</code> и{" "}
          <code>YOOKASSA_SECRET_KEY</code> в переменных окружения.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Подписка портала</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatMoney(summary.subscriptionPrice)} / {summary.subscriptionPeriodDays} дней
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              summary.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {SUBSCRIPTION_STATUS_LABELS[summary.subscription.status as SubscriptionStatus]}
          </span>
        </div>

        {summary.subscription.currentPeriodEnd && (
          <p className="mt-2 text-sm text-slate-500">
            {summary.active ? "Действует до" : "Истекла"}{" "}
            {formatDate(summary.subscription.currentPeriodEnd)}
          </p>
        )}

        {summary.enforced && !summary.active && (
          <p className="mt-2 text-sm text-red-600">
            На этом портале для размещения заказов и ставок нужна активная подписка.
          </p>
        )}

        <form action={paySubscription} className="mt-4">
          <button
            type="submit"
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
          >
            {summary.active ? "Продлить подписку" : "Оплатить подписку"}
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Комиссия площадки (1% с заказов)</h2>
          {summary.owedCommission > 0 && (
            <span className="text-sm font-medium text-red-600">
              К оплате: {formatMoney(summary.owedCommission)}
            </span>
          )}
        </div>

        {summary.commissionPayments.length === 0 ? (
          <p className="text-sm text-slate-400">
            Пока нет начислений — комиссия появляется здесь после завершения заказа, в
            котором вы были выбранным исполнителем/дизайнером.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.commissionPayments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  {payment.order && (
                    <Link
                      href={`/auctions/${payment.order.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {payment.order.title}
                    </Link>
                  )}
                  <p className="text-xs text-slate-400">{formatDate(payment.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">{formatMoney(payment.amount)}</span>
                  <span className="text-xs text-slate-500">
                    {PAYMENT_STATUS_LABELS[payment.status as PaymentStatus]}
                  </span>
                  {payment.status === "PENDING" && <PayCommissionButton paymentId={payment.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PayCommissionButton({ paymentId }: { paymentId: string }) {
  async function pay() {
    "use server";
    await payCommissionAction(paymentId);
  }

  return (
    <form action={pay}>
      <button
        type="submit"
        className="rounded-md bg-orange-600 px-2 py-1 text-xs font-semibold text-white hover:bg-orange-700"
      >
        Оплатить
      </button>
    </form>
  );
}
