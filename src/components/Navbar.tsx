import Link from "next/link";
import { auth } from "@/auth";
import { SignOutButton } from "@/components/SignOutButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { getI18n } from "@/lib/i18n";

export async function Navbar() {
  const [session, { locale, t }] = await Promise.all([auth(), getI18n()]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900 transition hover:text-orange-700">
          <span className="text-orange-600">⬡</span> PrintAu
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
          <Link href="/auctions" className="hover:text-slate-900">
            {t.nav.auctions}
          </Link>
          <Link href="/executors" className="hover:text-slate-900">
            {t.nav.specialists}
          </Link>
          {session?.user && (
            <>
              <Link href="/dashboard" className="hover:text-slate-900">
                {t.nav.dashboard}
              </Link>
              <Link href="/billing" className="hover:text-slate-900">
                {t.nav.billing}
              </Link>
              {session.user.role === "ADMIN" && (
                <Link href="/admin/settings" className="hover:text-slate-900">
                  {t.nav.admin}
                </Link>
              )}
            </>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <LanguageSwitcher current={locale} label={t.nav.language} />
          {session?.user ? (
            <>
              <Link
                href={`/u/${session.user.id}`}
                className="hidden text-sm text-slate-500 sm:inline"
              >
                {session.user.name} ({t.roles[session.user.role]})
              </Link>
              {session.user.role === "CUSTOMER" && (
                <Link href="/auctions/new" className="btn-primary btn-sm">
                  {t.nav.newOrder}
                </Link>
              )}
              <SignOutButton label={t.nav.logout} />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                {t.nav.login}
              </Link>
              <Link href="/register" className="btn-primary btn-sm">
                {t.nav.register}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
