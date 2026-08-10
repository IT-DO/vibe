import Link from "next/link";
import { getOpenOrders } from "@/lib/orders";
import { formatMoney, formatRelative } from "@/lib/format";
import { MATERIALS } from "@/lib/constants";
import { MaterialTag } from "@/components/MaterialTag";
import { MaterialsLegend } from "@/components/MaterialsLegend";
import { getDictionary } from "@/lib/i18n";

export default async function AuctionsPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; q?: string }>;
}) {
  const params = await searchParams;
  const orders = await getOpenOrders({ material: params.material, q: params.q });
  const dict = await getDictionary();
  const t = dict.auctions;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
        <Link href="/auctions/new" className="btn-primary">
          {t.newOrder}
        </Link>
      </div>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
        <input
          name="q"
          defaultValue={params.q}
          placeholder={t.searchPlaceholder}
          className="input max-w-xs"
        />
        <select name="material" defaultValue={params.material ?? ""} className="input max-w-xs">
          <option value="">{t.anyMaterial}</option>
          {MATERIALS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          {t.find}
        </button>
      </form>

      <MaterialsLegend className="mb-6" />

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {t.nothingFound}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/auctions/${order.id}`} className="card-hover group flex flex-col">
              <h3 className="mb-2 font-semibold text-slate-900 group-hover:text-orange-700">{order.title}</h3>
              <p className="mb-3 line-clamp-2 text-sm text-slate-500">{order.description}</p>
              <div className="mt-auto flex items-center justify-between text-sm text-slate-500">
                <MaterialTag material={order.material} />
                <span className="font-semibold text-slate-900">
                  {formatMoney(order.budgetMin)}–{formatMoney(order.budgetMax)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>{order.bids.length} {t.bidsCount} · {order.customer.name}</span>
                <span>{t.bidsEnd} {formatRelative(order.biddingEnds)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
