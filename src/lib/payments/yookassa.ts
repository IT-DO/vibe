import "server-only";
import { getSettings } from "@/lib/settings";

// Тонкая обёртка над REST API ЮKassa (без SDK — у них простой JSON API).
// https://yookassa.ru/developers/api

const API_BASE = "https://api.yookassa.ru/v3";

export async function isYooKassaConfigured(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings.yookassaShopId && settings.yookassaSecretKey);
}

async function authHeader(): Promise<string> {
  const settings = await getSettings();
  const shopId = settings.yookassaShopId ?? "";
  const secretKey = settings.yookassaSecretKey ?? "";
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
      Authorization: await authHeader(),
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
    headers: { Authorization: await authHeader() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YooKassa fetchPayment failed: ${res.status} ${text}`);
  }
  return res.json();
}
