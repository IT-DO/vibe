import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getOrdersByCustomer, getBidsByExecutor } from "@/lib/orders";
import { OrderStatusBadge, BidStatusBadge } from "@/components/StatusBadge";
import { formatMoney, formatRelative } from "@/lib/format";
import type { OrderStatus, BidStatus } from "@/lib/constants";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Личный кабинет</h1>
      {session.user.role === "CUSTOMER" ? (
        <CustomerDashboard customerId={session.user.id} />
      ) : (
        <ExecutorDashboard executorId={session.user.id} />
      )}
    </div>
  );
}

async function CustomerDashboard({ customerId }: { customerId: string }) {
  const orders = await getOrdersByCustomer(customerId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Мои заказы</h2>
        <Link
          href="/auctions/new"
          className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700"
        >
          + Новый заказ
        </Link>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          У вас пока нет заказов.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/auctions/${order.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300"
              >
                <div>
                  <p className="font-medium text-slate-900">{order.title}</p>
                  <p className="text-xs text-slate-400">
                    {order.bids.length} ставок · создан {formatRelative(order.createdAt)}
                  </p>
                </div>
                <OrderStatusBadge status={order.status as OrderStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function ExecutorDashboard({ executorId }: { executorId: string }) {
  const bids = await getBidsByExecutor(executorId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Мои ставки</h2>
        <Link href="/auctions" className="text-sm font-medium text-orange-600 hover:underline">
          Смотреть аукционы →
        </Link>
      </div>

      {bids.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Вы ещё не делали ставок.{" "}
          <Link href="/auctions" className="font-medium text-orange-600 hover:underline">
            Найти заказ
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {bids.map((bid) => (
            <li key={bid.id}>
              <Link
                href={`/auctions/${bid.orderId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300"
              >
                <div>
                  <p className="font-medium text-slate-900">{bid.order.title}</p>
                  <p className="text-xs text-slate-400">
                    Ваша ставка: {formatMoney(bid.price)} · {bid.leadTimeDays} дн. · заказчик{" "}
                    {bid.order.customer.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <BidStatusBadge status={bid.status as BidStatus} />
                  <OrderStatusBadge status={bid.order.status as OrderStatus} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
