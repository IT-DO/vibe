import { redirect } from "next/navigation";
import Header from "@/components/Header";
import Generator from "@/components/Generator";
import { currentUser } from "@/lib/session";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Сюда ЮKassa возвращает человека после оплаты (return_url в lib/yookassa.ts).
  // Кредиты начисляет вебхук, а он может прийти на секунду позже редиректа -
  // поэтому текст обещает "в течение минуты", а не "уже начислено".
  const justPaid = (await searchParams).payment === "done";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-10">
        {justPaid && (
          <p className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            Оплата принята. Генерации появятся на счёте в течение минуты — обнови страницу,
            если счётчик ещё старый.
          </p>
        )}
        <Generator initialCredits={user.credits} />
      </main>
    </>
  );
}
