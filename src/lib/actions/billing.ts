"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateSubscription, finalizePaidPayment } from "@/lib/billing";
import { isYooKassaConfigured, createYooKassaPayment } from "@/lib/payments/yookassa";
import { SUBSCRIPTION_PRICE_RUB } from "@/lib/constants";
import { getAppOrigin } from "@/lib/origin";
import type { ActionState } from "@/lib/actions/auth";

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
