import "server-only";

// Тонкая обёртка над REST API ЮKassa (без SDK — у них простой JSON API).
// https://yookassa.ru/developers/api

const API_BASE = "https://api.yookassa.ru/v3";

export function isYooKassaConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

function authHeader(): string {
  const shopId = process.env.YOOKASSA_SHOP_ID ?? "";
  const secretKey = process.env.YOOKASSA_SECRET_KEY ?? "";
  return "Basic " + Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

type YooKassaPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  metadata?: Record<string, string>;
  confirmation?: { type: string; confirmation_url?: string };
};

// idempotenceKey должен быть уникальным для конкретной попытки оплаты — используем
// id нашей записи Payment, чтобы повторные клики/ретраи не создавали дублей на
// стороне ЮKassa.
export async function createYooKassaPayment(params: {
  idempotenceKey: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<YooKassaPayment> {
  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify({
      amount: { value: params.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: params.returnUrl },
      description: params.description,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YooKassa createPayment failed: ${res.status} ${text}`);
  }

  return res.json();
}

// Используется и вебхуком, и (опционально) страницей возврата — НИКОГДА не
// доверяем статусу платежа из тела вебхука напрямую, всегда перезапрашиваем
// его у ЮKassa по id через авторизованный запрос нашим секретным ключом.
export async function fetchYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YooKassa fetchPayment failed: ${res.status} ${text}`);
  }
  return res.json();
}
