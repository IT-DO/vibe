import { auth } from "@/auth";
import { NewOrderForm } from "./NewOrderForm";
import { localeRedirect } from "@/lib/i18n/redirect";

export default async function NewOrderPage() {
  const session = await auth();
  if (!session?.user) return await localeRedirect("/login");
  if (session.user.role !== "CUSTOMER") return await localeRedirect("/auctions");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Новый заказ</h1>
      <p className="mt-1 text-sm text-slate-500">
        Опишите, что нужно напечатать. Исполнители увидят заказ в списке открытых
        аукционов и смогут предложить свою цену и сроки.
      </p>
      <NewOrderForm />
    </div>
  );
}
