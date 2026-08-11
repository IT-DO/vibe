"use client";

import { createContext, useContext } from "react";
import NextLink from "next/link";
import { DEFAULT_LOCALE, localePath, type Locale } from "@/lib/i18n/config";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

// Провайдер ставится один раз в корневом layout, куда локаль приходит с
// сервера. Через контекст её видят и клиентские компоненты, где нельзя
// вызвать серверный getLocale().
export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

// Замена next/link, которая сама дописывает языковой префикс к внутренним
// ссылкам: пишем href="/auctions", в HTML уходит "/en/auctions". Без этого
// переход уводил бы на адрес без языка, middleware редиректил бы обратно —
// лишний редирект на каждую навигацию, а поисковик видел бы дубли страниц.
// Компонент клиентский, поэтому одинаково работает в обоих видах компонентов.
export function LocaleLink({ href, ...rest }: React.ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  const localized = typeof href === "string" ? localePath(href, locale) : href;
  return <NextLink href={localized} {...rest} />;
}
