import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getOwnProfile } from "@/lib/users";
import { EditProfileForm } from "./EditProfileForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";
import { localeRedirect } from "@/lib/i18n/redirect";

// Личный/служебный раздел — из индекса исключён явно (плюс закрыт в robots.txt).
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    locale: await getLocale(),
    path: "/profile/edit",
    title: "PrintAu",
    description: "",
    noindex: true,
  });
}


export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user) return await localeRedirect("/login");

  // getOwnProfile explicitly selects only public-safe columns (никогда не
  // passwordHash) — важно, так как результат идёт в клиентский компонент ниже
  // и иначе целиком сериализовался бы в HTML/RSC-полезную нагрузку в браузере.
  const user = await getOwnProfile(session.user.id);
  if (!user) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Редактирование профиля</h1>
      <div className="card mt-6">
        <EditProfileForm user={user} />
      </div>

      <h2 className="mt-10 text-lg font-bold text-slate-900">Смена пароля</h2>
      <div className="card mt-4">
        <ChangePasswordForm />
      </div>
    </div>
  );
}
