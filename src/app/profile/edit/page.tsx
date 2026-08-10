import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { getOwnProfile } from "@/lib/users";
import { EditProfileForm } from "./EditProfileForm";

export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

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
    </div>
  );
}
