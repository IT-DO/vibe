import { AuthShell } from "@/components/AuthShell";
import { getDictionary } from "@/lib/i18n";
import { RegisterForm } from "./RegisterForm";

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

// Личный/служебный раздел — из индекса исключён явно (плюс закрыт в robots.txt).
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: await getLocale(),
    path: "/register",
    title: "PrintAu",
    description: "",
    noindex: true,
  });
}


export default async function RegisterPage() {
  const t = await getDictionary();

  return (
    <AuthShell>
      <RegisterForm t={t.auth} />
    </AuthShell>
  );
}
