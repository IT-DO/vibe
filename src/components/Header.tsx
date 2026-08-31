import Link from "next/link";
import { currentUser } from "@/lib/session";
import LogoutButton from "./LogoutButton";

export default async function Header() {
  const user = await currentUser();

  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Карточка<span className="text-brand">.</span>
        </Link>

        <nav className="flex items-center gap-5 text-sm">
          <Link href="/pricing" className="text-muted hover:text-ink">
            Тарифы
          </Link>
          {user ? (
            <>
              <span className="hidden text-muted sm:inline">
                Осталось: <strong className="text-ink">{user.credits}</strong>
              </span>
              <Link
                href="/app"
                className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Кабинет
              </Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted hover:text-ink">
                Войти
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark"
              >
                Попробовать
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
