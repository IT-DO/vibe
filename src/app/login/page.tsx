import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { getDictionary } from "@/lib/i18n";
import { LoginForm } from "./LoginForm";

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

// Личный/служебный раздел — из индекса исключён явно (плюс закрыт в robots.txt).
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: await getLocale(),
    path: "/login",
    title: "PrintAu",
    description: "",
    noindex: true,
  });
}


export default async function LoginPage() {
  const t = await getDictionary();

  return (
    <AuthShell>
      {/* useSearchParams в клиентской форме требует Suspense-границы. */}
      <Suspense fallback={<p className="text-sm text-slate-400">{t.common.loading}</p>}>
        <LoginForm t={t.auth} />
      </Suspense>
    </AuthShell>
  );
}
