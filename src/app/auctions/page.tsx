import Link from "next/link";
import { getOpenOrders } from "@/lib/orders";
import { formatMoney, formatRelative } from "@/lib/format";
import { MATERIALS } from "@/lib/constants";

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; q?: string }>;
}) {
  const params = await searchParams;
  const orders = await getOpenOrders({ material: params.material, q: params.q });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Открытые аукционы</h1>
        <Link
          href="/auctions/new"
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          + Разместить заказ
        </Link>
      </div>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={params.q}
          placeholder="Поиск по названию или описанию"
          className="input max-w-xs"
        />
        <select name="material" defaultValue={params.material ?? ""} className="input max-w-xs">
          <option value="">Любой материал</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Найти
        </button>
      </form>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Ничего не найдено. Попробуйте изменить фильтры.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/auctions/${order.id}`}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              <h3 className="mb-2 font-semibold text-slate-900">{order.title}</h3>
              <p className="mb-3 line-clamp-2 text-sm text-slate-500">{order.description}</p>
              <div className="mt-auto flex items-center justify-between text-sm text-slate-500">
                <span>{order.material}</span>
                <span>
                  {formatMoney(order.budgetMin)}–{formatMoney(order.budgetMax)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{order.bids.length} ставок · {order.customer.name}</span>
                <span>Ставки {formatRelative(order.biddingEnds)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
