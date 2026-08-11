import { requireAdmin } from "@/lib/admin";
import { localeRedirect } from "@/lib/i18n/redirect";

export default async function AdminIndexPage() {
  await requireAdmin();
  return await localeRedirect("/admin/settings");
}
