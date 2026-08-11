import { NextResponse, type NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  isLocale,
  splitLocalePath,
  type Locale,
} from "@/lib/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Порядок определения языка для входа без префикса: сохранённый выбор →
// Accept-Language браузера → язык по умолчанию.
function detectLocale(req: NextRequest): Locale {
  const fromCookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const acceptLanguage = req.headers.get("accept-language");
  if (acceptLanguage) {
    for (const part of acceptLanguage.split(",")) {
      const base = part.split(";")[0]?.trim().toLowerCase().split("-")[0];
      if (isLocale(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const { locale, path } = splitLocalePath(pathname);

  // Адрес без языкового префикса — уводим на префиксованный постоянным (308)
  // редиректом, чтобы у каждой страницы был ровно один канонический адрес и
  // поисковик не индексировал две версии одного и того же.
  if (!locale) {
    const target = req.nextUrl.clone();
    target.pathname = `/${detectLocale(req)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.redirect(target, 308);
  }

  // Префикс есть — отдаём внутренний (плоский) маршрут, а локаль прокидываем
  // заголовком. Так структура файлов приложения остаётся без /[locale]/,
  // но наружу каждый язык живёт по собственному адресу.
  const headers = new Headers(req.headers);
  headers.set(LOCALE_HEADER, locale);

  const rewritten = req.nextUrl.clone();
  rewritten.pathname = path;
  rewritten.search = search;

  const res = NextResponse.rewrite(rewritten, { request: { headers } });

  // Запоминаем язык, которым человек реально пользуется, — по нему потом
  // редиректим с корня и с непрефиксованных адресов.
  if (req.cookies.get(LOCALE_COOKIE)?.value !== locale) {
    res.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  return res;
}

// Не трогаем API, статику Next, файлы с расширением и служебные файлы,
// которые обязаны лежать в корне (robots.txt, sitemap.xml, favicon).
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.[\\w]+$).*)"],
};
