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
//
// customerEmail обязателен: по 54-ФЗ при приёме денег от физлица нужно выдать
// фискальный чек, а ЮKassa отправляет его именно на этот адрес. Своя касса при
// этом не нужна — блок receipt ниже включает «Чеки от ЮKassa», услугу надо
// один раз подключить в личном кабинете магазина.
export async function createYooKassaPayment(params: {
  idempotenceKey: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
  customerEmail: string;
}): Promise<YooKassaPayment> {
  const settings = await getSettings();
  const amount = { value: params.amountRub.toFixed(2), currency: "RUB" };

  const receipt = {
    customer: { email: params.customerEmail },
    tax_system_code: settings.taxSystemCode,
    items: [
      {
        // Наименование позиции в чеке ограничено 128 символами.
        description: params.description.slice(0, 128),
        quantity: "1.00",
        amount,
        vat_code: settings.vatCode,
        // Услуга, оплаченная целиком в момент расчёта: и подписка, и комиссия
        // площадки — это плата за уже оказанный/оказываемый доступ к сервису.
        payment_mode: "full_payment",
        payment_subject: "service",
      },
    ],
  };

  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: await authHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": params.idempotenceKey,
    },
    body: JSON.stringify({
      amount,
      capture: true,
      confirmation: { type: "redirect", return_url: params.returnUrl },
      description: params.description,
      metadata: params.metadata,
      receipt,
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
