import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { ru, type Dictionary } from "./locales/ru";
import { en } from "./locales/en";
import { zh } from "./locales/zh";
import { hi } from "./locales/hi";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { ar } from "./locales/ar";

const DICTIONARIES: Record<Locale, Dictionary> = { ru, en, zh, hi, es, fr, ar };

// Приоритет: явный выбор пользователя (кука) → Accept-Language браузера →
// язык по умолчанию. Так первый визит из другой страны сразу открывается на
// понятном языке, но ручной выбор всегда важнее автоопределения.
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = (await headers()).get("accept-language");
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const tag = part.split(";")[0]?.trim().toLowerCase();
      const base = tag?.split("-")[0];
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
