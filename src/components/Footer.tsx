import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-paper">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Карточка</p>
        <nav className="flex gap-5">
          <Link href="/legal/offer" className="hover:text-ink">
            Оферта
          </Link>
          <Link href="/legal/privacy" className="hover:text-ink">
            Обработка данных
          </Link>
          <a href="mailto:hello@example.ru" className="hover:text-ink">
            hello@example.ru
          </a>
        </nav>
      </div>
    </footer>
  );
}
