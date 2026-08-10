import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PrintAukcion — 3D-печать на заказ",
  description:
    "Портал для заказчиков и исполнителей 3D-печати: аукцион ставок, отзывы и рейтинги.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Navbar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-slate-800 bg-slate-900 text-slate-400">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <div className="flex items-center gap-2 text-base font-bold text-white">
                  <span className="text-orange-500">⬡</span> PrintAukcion
                </div>
                <p className="mt-2 max-w-xs text-sm text-slate-500">
                  Биржа 3D-печати и 3D-моделирования: аукцион ставок, отзывы и
                  рейтинги для заказчиков, исполнителей и дизайнеров.
                </p>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Площадка
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/auctions" className="hover:text-white">
                      Открытые аукционы
                    </Link>
                  </li>
                  <li>
                    <Link href="/executors" className="hover:text-white">
                      Каталог специалистов
                    </Link>
                  </li>
                  <li>
                    <Link href="/auctions/new" className="hover:text-white">
                      Разместить заказ
                    </Link>
                  </li>
                  <li>
                    <Link href="/materials" className="hover:text-white">
                      Материалы и технологии
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Документы
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link href="/privacy" className="hover:text-white">
                      Политика конфиденциальности
                    </Link>
                  </li>
                  <li>
                    <Link href="/offer" className="hover:text-white">
                      Публичная оферта
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-slate-800 pt-6 text-xs text-slate-600">
              PrintAukcion — учебный проект, демонстрация портала 3D-печати.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
