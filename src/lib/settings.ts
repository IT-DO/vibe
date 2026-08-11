import "server-only";
import { prisma } from "@/lib/prisma";
import {
  SUBSCRIPTION_PRICE_RUB,
  SUBSCRIPTION_PERIOD_DAYS,
  COMMISSION_RATE,
  DEFAULT_TAX_SYSTEM_CODE,
  DEFAULT_VAT_CODE,
} from "@/lib/constants";

const SETTINGS_ID = "singleton";

export type ResolvedSettings = {
  subscriptionPriceRub: number;
  subscriptionPeriodDays: number;
  commissionRate: number;
  subscriptionEnforced: boolean;
  appUrl: string | null;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPass: string | null;
  mailFrom: string | null;
  yookassaShopId: string | null;
  yookassaSecretKey: string | null;
  alertEmail: string | null;
  internalAlertToken: string | null;
  taxSystemCode: number;
  vatCode: number;
};

// Значения из БД (админка) переопределяют .env, а .env переопределяет
// встроенные значения по умолчанию — так уже развёрнутые инстансы без
// единой строки в PlatformSettings продолжают работать ровно как раньше.
// Короткий in-memory кэш — чтобы частые чтения (каждый рендер /billing,
// каждое письмо) не били в БД лишний раз; invalidateSettingsCache()
// вызывается сразу после сохранения в админке, так что изменения видны
// практически мгновенно.
let cache: { value: ResolvedSettings; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5000;

export function invalidateSettingsCache(): void {
  cache = null;
}

export async function getSettings(): Promise<ResolvedSettings> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const row = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });

  const value: ResolvedSettings = {
    subscriptionPriceRub: row?.subscriptionPriceRub ?? SUBSCRIPTION_PRICE_RUB,
    subscriptionPeriodDays: row?.subscriptionPeriodDays ?? SUBSCRIPTION_PERIOD_DAYS,
    commissionRate:
      row?.commissionRatePercent != null ? row.commissionRatePercent / 100 : COMMISSION_RATE,
    subscriptionEnforced: row?.subscriptionEnforced ?? process.env.SUBSCRIPTION_ENFORCEMENT === "true",
    appUrl: row?.appUrl || process.env.APP_URL || null,
    smtpHost: row?.smtpHost || process.env.SMTP_HOST || null,
    smtpPort: row?.smtpPort ?? Number(process.env.SMTP_PORT ?? 587),
    smtpUser: row?.smtpUser || process.env.SMTP_USER || null,
    smtpPass: row?.smtpPass || process.env.SMTP_PASS || null,
    mailFrom: row?.mailFrom || process.env.MAIL_FROM || null,
    yookassaShopId: row?.yookassaShopId || process.env.YOOKASSA_SHOP_ID || null,
    yookassaSecretKey: row?.yookassaSecretKey || process.env.YOOKASSA_SECRET_KEY || null,
    alertEmail: row?.alertEmail || process.env.ALERT_EMAIL || null,
    internalAlertToken: row?.internalAlertToken || process.env.INTERNAL_ALERT_TOKEN || null,
    taxSystemCode: row?.taxSystemCode ?? DEFAULT_TAX_SYSTEM_CODE,
    vatCode: row?.vatCode ?? DEFAULT_VAT_CODE,
  };

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

// Поля, которые реально можно поменять из админки — подмножество
// PlatformSettings без id/updatedAt. undefined-значение поля в patch
// означает "оставить как есть", null — "явно очистить (вернуться к .env)".
export type SettingsPatch = Partial<{
  subscriptionPriceRub: number | null;
  subscriptionPeriodDays: number | null;
  commissionRatePercent: number | null;
  subscriptionEnforced: boolean | null;
  appUrl: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  mailFrom: string | null;
  yookassaShopId: string | null;
  yookassaSecretKey: string | null;
  alertEmail: string | null;
  internalAlertToken: string | null;
  taxSystemCode: number | null;
  vatCode: number | null;
}>;

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  await prisma.platformSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...patch },
    update: patch,
  });
  invalidateSettingsCache();
}

export async function getRawSettingsRow() {
  return prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
}

// Вид настроек для формы админки: обычные поля отдаём как есть (текущее
// эффективное значение — из БД или из .env), а секреты (пароль SMTP, ключ
// ЮKassa, токен алертов) — НИКОГДА фактическим значением, только флагом
// isSet и источником, откуда оно взялось. Иначе секрет попал бы в RSC-пейлоад
// страницы и был бы виден в исходнике HTML любому, кто откроет /admin/settings
// (тот же принцип, что и passwordHash — см. src/lib/users.ts).
export type AdminSettingsView = {
  subscriptionPriceRub: number;
  subscriptionPeriodDays: number;
  commissionRatePercent: number;
  subscriptionEnforced: boolean;
  appUrl: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  mailFrom: string;
  yookassaShopId: string;
  alertEmail: string;
  taxSystemCode: number;
  vatCode: number;
  smtpPass: { isSet: boolean; fromEnv: boolean };
  yookassaSecretKey: { isSet: boolean; fromEnv: boolean };
  internalAlertToken: { isSet: boolean; fromEnv: boolean };
};

export async function getAdminSettingsView(): Promise<AdminSettingsView> {
  const [row, resolved] = await Promise.all([getRawSettingsRow(), getSettings()]);

  return {
    // Показываем действующее значение (БД или .env) — так форма при первом
    // открытии сразу отражает реальную текущую конфигурацию, а не пустоту.
    subscriptionPriceRub: resolved.subscriptionPriceRub,
    subscriptionPeriodDays: resolved.subscriptionPeriodDays,
    commissionRatePercent: resolved.commissionRate * 100,
    subscriptionEnforced: resolved.subscriptionEnforced,
    appUrl: resolved.appUrl ?? "",
    smtpHost: resolved.smtpHost ?? "",
    smtpPort: resolved.smtpPort,
    smtpUser: resolved.smtpUser ?? "",
    mailFrom: resolved.mailFrom ?? "",
    yookassaShopId: resolved.yookassaShopId ?? "",
    alertEmail: resolved.alertEmail ?? "",
    taxSystemCode: resolved.taxSystemCode,
    vatCode: resolved.vatCode,
    smtpPass: {
      isSet: Boolean(resolved.smtpPass),
      fromEnv: !row?.smtpPass && Boolean(process.env.SMTP_PASS),
    },
    yookassaSecretKey: {
      isSet: Boolean(resolved.yookassaSecretKey),
      fromEnv: !row?.yookassaSecretKey && Boolean(process.env.YOOKASSA_SECRET_KEY),
    },
    internalAlertToken: {
      isSet: Boolean(resolved.internalAlertToken),
      fromEnv: !row?.internalAlertToken && Boolean(process.env.INTERNAL_ALERT_TOKEN),
    },
  };
}
