import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, isLocale, type Locale } from "./config";
import { ru, type Dictionary } from "./locales/ru";
import { en } from "./locales/en";
import { zh } from "./locales/zh";
import { hi } from "./locales/hi";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ar } from "./locales/ar";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, en, zh, hi, es, fr, ar };

// Источник правды — языковой префикс в адресе, который middleware разобрал и
// положил в заголовок. Кука и Accept-Language остаются запасным вариантом для
// контекстов, куда middleware не доходит (например, серверные экшены,
// вызванные без навигации).
export async function getLocale(): Promise<Locale> {
  const headerStore = await headers();

  const fromPath = headerStore.get(LOCALE_HEADER);
  if (isLocale(fromPath)) return fromPath;

  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = headerStore.get("accept-language");
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const base = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
      if (isLocale(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

export async function getDictionary(): Promise<Dictionary> {
  return DICTIONARIES[await getLocale()];
}

// Удобный шорткат для страниц, которым нужны и словарь, и сама локаль
// (например, для форматирования чисел/дат через Intl).
export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await getLocale();
  return { locale, t: DICTIONARIES[locale] };
}

export type { Dictionary };
