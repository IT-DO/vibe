// Локаль живёт в первом сегменте URL (/en/auctions, /zh/auctions) — это
// обязательное условие для международного SEO: без отдельного адреса на язык
// поисковик видит один URL с меняющимся содержимым и не может показать
// пользователю его языковую версию. Кука остаётся только как память о выборе
// пользователя для редиректа с корня, но источник правды — путь.
export const LOCALES = ["ru", "en", "zh", "hi", "es", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ru";
export const LOCALE_COOKIE = "locale";

// Заголовок, которым middleware передаёт распознанную из пути локаль серверным
// компонентам. Живёт здесь, а не в middleware.ts, чтобы серверный код не
// импортировал модуль edge-рантайма ради одной строки.
export const LOCALE_HEADER = "x-app-locale";

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

// --- Работа с локалью в пути ---

// Вырезает языковой префикс: "/en/auctions" → { locale: "en", path: "/auctions" }.
// Если префикса нет, локаль null — вызывающий код сам решает, что делать.
export function splitLocalePath(pathname: string): { locale: Locale | null; path: string } {
  const segments = pathname.split("/");
  const first = segments[1];
  if (isLocale(first)) {
    const rest = "/" + segments.slice(2).join("/");
    return { locale: first, path: rest === "/" ? "/" : rest.replace(/\/$/, "") };
  }
  return { locale: null, path: pathname };
}

// Собирает адрес с языковым префиксом: ("/auctions", "en") → "/en/auctions".
// Внешние ссылки, якоря и mailto оставляем как есть.
export function localePath(path: string, locale: Locale): string {
  if (!path.startsWith("/")) return path;
  const { path: clean } = splitLocalePath(path);
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}
