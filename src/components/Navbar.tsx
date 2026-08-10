import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { ROLE_LABELS } from "@/lib/constants";

export async function Navbar() {
  const session = await auth();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="text-orange-600">⬡</span> PrintAukcion
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
          <Link href="/auctions" className="hover:text-slate-900">
            Аукционы
          </Link>
          <Link href="/executors" className="hover:text-slate-900">
            Исполнители
          </Link>
          {session?.user && (
            <Link href="/dashboard" className="hover:text-slate-900">
              Кабинет
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-4">
          {session?.user ? (
            <>
              <Link
                href={`/u/${session.user.id}`}
                className="hidden text-sm text-slate-500 sm:inline"
              >
                {session.user.name} ({ROLE_LABELS[session.user.role]})
              </Link>
              {session.user.role === "CUSTOMER" && (
                <Link
                  href="/auctions/new"
                  className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
                >
                  + Заказ
                </Link>
              )}
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                Войти
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
              >
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
