import { type OrderStatus, type BidStatus } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

const ORDER_STYLES: Record<OrderStatus, string> = {
  OPEN: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  AWARDED: "bg-blue-50 text-blue-700 ring-blue-600/20",
  IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-600/20",
  COMPLETED: "bg-slate-100 text-slate-700 ring-slate-500/20",
  CANCELLED: "bg-red-50 text-red-700 ring-red-600/20",
};

const BID_STYLES: Record<BidStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-500/20",
  ACCEPTED: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  REJECTED: "bg-red-50 text-red-700 ring-red-600/20",
  WITHDRAWN: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export async function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = await getDictionary();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ORDER_STYLES[status]}`}
    >
      {t.orderStatus[status]}
    </span>
  );
}

export async function BidStatusBadge({ status }: { status: BidStatus }) {
  const t = await getDictionary();
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BID_STYLES[status]}`}
    >
      {t.bidStatus[status]}
    </span>
  );
}
