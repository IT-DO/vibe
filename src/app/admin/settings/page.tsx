import { requireAdmin } from "@/lib/admin";
import { getAdminSettingsView } from "@/lib/settings";
import { SettingsForm } from "./SettingsForm";

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

// Личный/служебный раздел — из индекса исключён явно (плюс закрыт в robots.txt).
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: await getLocale(),
    path: "/admin/settings",
    title: "PrintAu",
    description: "",
    noindex: true,
  });
}


export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getAdminSettingsView();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Настройки площадки</h1>
      <p className="mt-1 text-sm text-slate-500">
        Параметры, которые раньше можно было задать только через переменные окружения
        (.env) на сервере. Здесь они применяются сразу, без передеплоя. Пустое
        необязательное поле означает «использовать значение из .env» — если там тоже
        ничего нет, включается демо-режим соответствующей функции.
      </p>
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Пароли и секретные ключи не выводятся обратно на экран — только отметка,
        задано ли значение. <code>DATABASE_URL</code>, <code>AUTH_SECRET</code> и{" "}
        <code>UPLOAD_DIR</code> здесь не редактируются: их смена требует перезапуска
        контейнера, поэтому они остаются только в .env.
      </div>

      <SettingsForm initial={settings} />
    </div>
  );
}
