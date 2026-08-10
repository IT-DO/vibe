import { Suspense } from "react";
import { AuthShell } from "@/components/AuthShell";
import { getDictionary } from "@/lib/i18n";
import { LoginForm } from "./LoginForm";

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
