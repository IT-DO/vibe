import { prisma } from "@/lib/prisma";
import { finalizePaidPayment } from "@/lib/billing";
import { fetchYooKassaPayment, isYooKassaConfigured } from "@/lib/payments/yookassa";

// ЮKassa не подписывает вебхуки секретом по умолчанию, поэтому тело запроса
// само по себе не является доказательством оплаты — что угодно может
// прислать POST на этот URL. Единственное, чему мы верим — статус, который
// сами же запрашиваем у ЮKassa по id платежа авторизованным запросом с нашим
// секретным ключом (fetchYooKassaPayment). Тело вебхука используется только
// чтобы понять, какой id платежа перепроверить.
export async function POST(req: Request) {
  if (!(await isYooKassaConfigured())) {
    return new Response("Not configured", { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const providerPaymentId =
    body && typeof body === "object" && "object" in body
      ? (body as { object?: { id?: unknown } }).object?.id
      : undefined;

  if (typeof providerPaymentId !== "string" || !providerPaymentId) {
    return new Response("Bad request", { status: 400 });
  }

  const payment = await prisma.payment.findUnique({ where: { providerPaymentId } });
  if (!payment) {
    // Неизвестный нам id — отвечаем 200, чтобы провайдер не ретраил бесконечно
    // событие, которое мы всё равно никогда не сможем сопоставить.
    return new Response("OK", { status: 200 });
  }

  try {
    const authoritative = await fetchYooKassaPayment(providerPaymentId);
    if (authoritative.status === "succeeded" && authoritative.paid) {
      await finalizePaidPayment(payment.id, "yookassa");
    }
  } catch (err) {
    console.error("YooKassa webhook verification failed", err);
    return new Response("Verification failed", { status: 502 });
  }

  return new Response("OK", { status: 200 });
}
