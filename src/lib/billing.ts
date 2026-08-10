import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export async function getOrCreateSubscription(userId: string) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.subscription.create({ data: { userId } });
}

export function isSubscriptionActive(subscription: {
  status: string;
  currentPeriodEnd: Date | null;
}): boolean {
  return (
    subscription.status === "ACTIVE" &&
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd.getTime() > Date.now()
  );
}

// Включение платного гейта управляется настройкой площадки (админка →
// переменная окружения SUBSCRIPTION_ENFORCEMENT как запасной вариант), а не
// хардкодом, чтобы уже развёрнутый инстанс не сломался сам собой при
// обновлении кода — см. README/DEPLOY.md. Пока не включено, подписка только
// считается и показывается, но ничего не блокирует.
export async function isSubscriptionEnforced(): Promise<boolean> {
  const settings = await getSettings();
  return settings.subscriptionEnforced;
}

export async function requireActiveSubscription(userId: string): Promise<string | null> {
  if (!(await isSubscriptionEnforced())) return null;
  const settings = await getSettings();
  const subscription = await getOrCreateSubscription(userId);
  if (isSubscriptionActive(subscription)) return null;
  return `Нужна активная подписка портала (${settings.subscriptionPriceRub} ₽/мес). Оформите её в разделе «Оплата».`;
}

// Комиссия площадки: 1% от цены принятой ставки (настраивается в админке),
// начисляется победившему исполнителю/дизайнеру один раз в момент
// завершения заказа. Идемпотентно — повторный вызов для уже обработанного
// заказа ничего не создаёт.
export async function recordCommissionForOrder(orderId: string): Promise<void> {
  const alreadyRecorded = await prisma.payment.findFirst({
    where: { orderId, type: "COMMISSION" },
    select: { id: true },
  });
  if (alreadyRecorded) return;

  const winningBid = await prisma.bid.findFirst({
    where: { orderId, status: "ACCEPTED" },
    select: { executorId: true, price: true },
  });
  if (!winningBid) return;

  const settings = await getSettings();
  const amount = Math.round(winningBid.price * settings.commissionRate);
  if (amount <= 0) return;

  await prisma.payment.create({
    data: {
      type: "COMMISSION",
      amount,
      payerId: winningBid.executorId,
      orderId,
      status: "PENDING",
    },
  });
}

// Единая точка, где Payment реально помечается оплаченным и (для подписки)
// продлевается период действия. Вызывается и из демо-режима (без платёжного
// провайдера), и из вебхука ЮKassa — после того, как вызывающий код уже
// убедился, что платёж на самом деле прошёл.
export async function finalizePaidPayment(paymentId: string, provider: string): Promise<void> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status === "PAID") return; // уже обработано — идемпотентность

  const now = new Date();
  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", paidAt: now, provider },
  });

  if (payment.subscriptionId) {
    const settings = await getSettings();
    const subscription = await prisma.subscription.findUnique({
      where: { id: payment.subscriptionId },
    });
    const base =
      subscription?.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > now.getTime()
        ? subscription.currentPeriodEnd
        : now;
    const currentPeriodEnd = new Date(base.getTime() + settings.subscriptionPeriodDays * 24 * 60 * 60 * 1000);
    await prisma.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "ACTIVE", currentPeriodEnd },
    });
  }
}

export async function getBillingSummary(userId: string) {
  const [subscription, commissionPayments, settings] = await Promise.all([
    getOrCreateSubscription(userId),
    prisma.payment.findMany({
      where: { payerId: userId, type: "COMMISSION" },
      include: { order: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);

  const owedCommission = commissionPayments
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum + p.amount, 0);

  return {
    subscription,
    active: isSubscriptionActive(subscription),
    enforced: settings.subscriptionEnforced,
    commissionPayments,
    owedCommission,
    subscriptionPrice: settings.subscriptionPriceRub,
    subscriptionPeriodDays: settings.subscriptionPeriodDays,
    commissionRatePercent: settings.commissionRate * 100,
  };
}
