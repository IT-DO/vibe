import crypto from "node:crypto";
import type { Plan } from "./plans";

/**
 * Интеграция с ЮKassa.
 *
 * Ключевая мысль, которую легко пропустить: вебхуку от платёжной системы
 * нельзя верить на слово. Кто угодно может послать тебе POST "оплачено".
 * Поэтому мы делаем две вещи:
 *   1) проверяем, что запрос пришёл с IP-адресов ЮKassa;
 *   2) сами перезапрашиваем платёж по его id и смотрим статус в ответе API.
 * Второе - главное. Первое - дополнительный барьер.
 */

const API = "https://api.yookassa.ru/v3";

export type YooPayment = {
  id: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { type: string; confirmation_url?: string };
  metadata?: Record<string, string>;
};

export function isConfigured(): boolean {
  return Boolean(process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY);
}

function authHeader(): string {
  const pair = `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`;
  return `Basic ${Buffer.from(pair).toString("base64")}`;
}

export async function createPayment(args: {
  plan: Plan;
  userId: number;
  userEmail: string;
}): Promise<YooPayment> {
  const { plan, userId, userEmail } = args;
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  const body: Record<string, unknown> = {
    amount: { value: plan.priceRub, currency: "RUB" },
    capture: true, // списываем сразу, без двухстадийной схемы
    confirmation: { type: "redirect", return_url: `${appUrl}/app?payment=done` },
    description: `${plan.title}: ${plan.credits} генераций`,
    // metadata вернётся к нам в вебхуке - так мы поймём, кому начислять
    metadata: { userId: String(userId), planId: plan.id },
  };

  // Чек по 54-ФЗ. Нужен, только если к магазину подключена онлайн-касса.
  // Если кассы нет, а чек отправить - ЮKassa вернёт ошибку.
  if (process.env.YOOKASSA_SEND_RECEIPT === "true") {
    body.receipt = {
      customer: { email: userEmail },
      items: [
        {
          description: `${plan.title}: ${plan.credits} генераций`.slice(0, 128),
          quantity: "1.00",
          amount: { value: plan.priceRub, currency: "RUB" },
          vat_code: 1, // 1 = без НДС. Свой код уточни у бухгалтера.
          payment_subject: "service",
          payment_mode: "full_payment",
        },
      ],
    };
  }

  const response = await fetch(`${API}/payments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(),
      // Ключ идемпотентности: если запрос повторится из-за обрыва сети,
      // ЮKassa вернёт тот же платёж, а не создаст второй.
      "Idempotence-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ЮKassa ответила ${response.status}: ${detail.slice(0, 300)}`);
  }
  return (await response.json()) as YooPayment;
}

/** Перезапрос платежа - единственный источник правды о его статусе. */
export async function fetchPayment(paymentId: string): Promise<YooPayment> {
  const response = await fetch(`${API}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { authorization: authHeader() },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`ЮKassa ответила ${response.status} при проверке платежа ${paymentId}`);
  }
  return (await response.json()) as YooPayment;
}

// --- Проверка источника вебхука --------------------------------------------

// Официальный список сетей ЮKassa. Если он поменяется - обнови здесь.
// https://yookassa.ru/developers/using-api/webhooks
const YOOKASSA_NETWORKS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
];
const YOOKASSA_V6_PREFIX = "2a02:5180:";

export function isYookassaIp(ip: string | null): boolean {
  if (!ip) return false;
  const clean = ip.trim().replace(/^::ffff:/, ""); // IPv4, завёрнутый в IPv6

  if (clean.includes(":")) {
    return clean.toLowerCase().startsWith(YOOKASSA_V6_PREFIX);
  }
  return YOOKASSA_NETWORKS.some((cidr) => inNetwork(clean, cidr));
}

function inNetwork(ip: string, cidr: string): boolean {
  const [range, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  const a = toInt(ip);
  const b = toInt(range);
  if (a === null || b === null) return false;
  // Маска из старших `bits` бит. >>> 0 - чтобы не уехать в отрицательные числа.
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function toInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

/**
 * Достаёт IP клиента из заголовков.
 * За обратным прокси (nginx, Caddy) настоящий адрес лежит в X-Forwarded-For,
 * а первым в списке идёт исходный клиент.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}
