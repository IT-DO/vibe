import type { Metadata } from "next";
import { LocaleLink as Link, LocaleProvider } from "@/components/LocaleLink";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getI18n } from "@/lib/i18n";
import { isRtl } from "@/lib/i18n/config";
import { pageMetadata, getSiteUrl, SITE_NAME } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Метаданные корня отвечают за главную страницу; вложенные страницы
// переопределяют их своими generateMetadata.
export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getLocale(), "home", "/");
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();
  const siteUrl = await getSiteUrl();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        description: t.footer.tagline,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        inLanguage: locale,
        publisher: { "@id": `${siteUrl}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${siteUrl}/${locale}/auctions?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {/* Разметка Schema.org: даёт поисковику понять, что это за сайт, и
            включает поле поиска прямо в выдаче. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <LocaleProvider locale={locale}>
          <Navbar />
          <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-800 bg-slate-900 text-slate-400">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <span className="text-orange-500">⬡</span> PrintAu
                </div>
                <p className="mt-2 max-w-xs text-sm text-slate-500">{t.footer.tagline}</p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.footer.platform}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/auctions" className="hover:text-white">
                      {t.footer.openAuctions}
                    </Link>
                  </li>
                  <li>
                    <Link href="/executors" className="hover:text-white">
                      {t.footer.specialistsCatalog}
                    </Link>
                  </li>
                  <li>
                    <Link href="/auctions/new" className="hover:text-white">
                      {t.footer.placeOrder}
                    </Link>
                  </li>
                  <li>
                    <Link href="/materials" className="hover:text-white">
                      {t.footer.materials}
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t.footer.documents}
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/privacy" className="hover:text-white">
                      {t.footer.privacy}
                    </Link>
                  </li>
                  <li>
                    <Link href="/offer" className="hover:text-white">
                      {t.footer.offer}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-slate-800 pt-6 text-xs text-slate-600">
              {t.footer.disclaimer}
            </div>
          </div>
        </footer>
        </LocaleProvider>
      </body>
    </html>
  );
}
