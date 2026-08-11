import { LocaleLink as Link } from "@/components/LocaleLink";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { AuthShell } from "@/components/AuthShell";

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

// Личный/служебный раздел — из индекса исключён явно (плюс закрыт в robots.txt).
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: await getLocale(),
    path: "/reset-password",
    title: "PrintAu",
    description: "",
    noindex: true,
  });
}


export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-900">Новый пароль</h1>

      {!token ? (
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Ссылка неполная — не указан токен. Запросите сброс пароля{" "}
          <Link href="/forgot-password" className="font-medium underline">
            заново
          </Link>
          .
        </p>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
