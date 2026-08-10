// Локаль хранится в куке, а не в сегменте URL — так не нужно переписывать все
// маршруты и ссылки в приложении, а серверные компоненты читают её напрямую
// через cookies(). Для SEO-критичного продакшена правильнее /[locale]/...,
// но для этой площадки простота важнее.
export const LOCALES = ["ru", "en", "zh", "hi", "es", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "locale";

// Арабский — единственный RTL-язык в списке; направление проставляется на <html>.
export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const LOCALE_META: Record<Locale, { label: string; englishLabel: string; flag: string }> = {
  ru: { label: "Русский", englishLabel: "Russian", flag: "🇷🇺" },
  en: { label: "English", englishLabel: "English", flag: "🇬🇧" },
  zh: { label: "中文", englishLabel: "Chinese", flag: "🇨🇳" },
  hi: { label: "हिन्दी", englishLabel: "Hindi", flag: "🇮🇳" },
  es: { label: "Español", englishLabel: "Spanish", flag: "🇪🇸" },
  fr: { label: "Français", englishLabel: "French", flag: "🇫🇷" },
  ar: { label: "العربية", englishLabel: "Arabic", flag: "🇸🇦" },
};

// BCP 47 теги для Intl.NumberFormat / Intl.DateTimeFormat — у нас коды локалей
// совпадают с языковыми тегами, но выносим явно, чтобы при добавлении
// региональных вариантов (pt-BR и т.п.) менять было в одном месте.
export const INTL_LOCALE: Record<Locale, string> = {
  ru: "ru-RU",
  en: "en-US",
  zh: "zh-CN",
  hi: "hi-IN",
  es: "es-ES",
  fr: "fr-FR",
  ar: "ar-SA",
};
