import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Карточка — тексты для Wildberries и Ozon за 30 секунд",
  description:
    "Загружаешь название и характеристики товара — получаешь заголовок, описание, буллеты и ключевые слова для карточки на маркетплейсе.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
