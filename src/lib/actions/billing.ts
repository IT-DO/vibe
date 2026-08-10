"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateSubscription, finalizePaidPayment } from "@/lib/billing";
import { isYooKassaConfigured, createYooKassaPayment } from "@/lib/payments/yookassa";
import { SUBSCRIPTION_PRICE_RUB } from "@/lib/constants";
import type { ActionState } from "@/lib/actions/auth";

// Куда ЮKassa вернёт плательщика после оплаты. Если задан APP_URL — используем
// его: для боевого домена так надёжнее, потому что Host-заголовок запроса в
// принципе можно подделать (в цепочке до неправильно настроенного прокси), а
// это уже ссылка, которую реально показывают постороннему плательщику, а не
// только внутренняя логика вроде AUTH_TRUST_HOST. Без APP_URL — как раньше,
// подстраиваемся под заголовки запроса, чтобы всё работало сразу и на
// localhost, и по LAN IP без дополнительной настройки.
async function getAppOrigin(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function startSubscriptionPaymentAction(): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const subscription = await getOrCreateSubscription(session.user.id);

  const payment = await prisma.payment.create({
    data: {
      type: "SUBSCRIPTION",
      amount: SUBSCRIPTION_PRICE_RUB,
      payerId: session.user.id,
      subscriptionId: subscription.id,
      status: "PENDING",
    },
  });

  if (!isYooKassaConfigured()) {
    // Нет ключей платёжного провайдера — рабочий демо-режим: платёж сразу
    // считается оплаченным, чтобы можно было проверить весь сценарий до
    // подключения реальной оплаты. См. /privacy и README.
    await finalizePaidPayment(payment.id, "manual");
    revalidatePath("/billing");
    redirect("/billing?demo=1");
  }

  const origin = await getAppOrigin();
  let confirmationUrl: string | undefined;
  try {
    const ykPayment = await createYooKassaPayment({
      idempotenceKey: payment.id,
      amountRub: SUBSCRIPTION_PRICE_RUB,
      description: "Подписка PrintAukcion, 30 дней",
      returnUrl: `${origin}/billing`,
      metadata: { paymentId: payment.id },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provider: "yookassa", providerPaymentId: ykPayment.id },
    });
    confirmationUrl = ykPayment.confirmation?.confirmation_url;
  } catch (err) {
    console.error("YooKassa createPayment failed", err);
    return { error: "Не удалось начать оплату. Попробуйте позже." };
  }

  if (!confirmationUrl) return { error: "Платёжный провайдер не вернул ссылку на оплату" };
  redirect(confirmationUrl);
}

export async function payCommissionAction(paymentId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.type !== "COMMISSION") return { error: "Начисление не найдено" };
  if (payment.payerId !== session.user.id) return { error: "Недостаточно прав" };
  if (payment.status !== "PENDING") return { error: "Уже обработано" };

  if (!isYooKassaConfigured()) {
    await finalizePaidPayment(payment.id, "manual");
    revalidatePath("/billing");
    redirect("/billing?demo=1");
  }

  const origin = await getAppOrigin();
  let confirmationUrl: string | undefined;
  try {
    const ykPayment = await createYooKassaPayment({
      idempotenceKey: payment.id,
      amountRub: payment.amount,
      description: `Комиссия площадки по заказу ${payment.orderId ?? ""}`.trim(),
      returnUrl: `${origin}/billing`,
      metadata: { paymentId: payment.id },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { provider: "yookassa", providerPaymentId: ykPayment.id },
    });
    confirmationUrl = ykPayment.confirmation?.confirmation_url;
  } catch (err) {
    console.error("YooKassa createPayment failed", err);
    return { error: "Не удалось начать оплату. Попробуйте позже." };
  }

  if (!confirmationUrl) return { error: "Платёжный провайдер не вернул ссылку на оплату" };
  redirect(confirmationUrl);
}
