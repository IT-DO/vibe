import { AuthShell } from "@/components/AuthShell";
import { getDictionary } from "@/lib/i18n";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const t = await getDictionary();

  return (
    <AuthShell>
      <RegisterForm t={t.auth} />
    </AuthShell>
  );
}
