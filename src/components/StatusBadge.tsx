import {
  ORDER_STATUS_LABELS,
  BID_STATUS_LABELS,
  type OrderStatus,
  type BidStatus,
} from "@/lib/constants";

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

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ORDER_STYLES[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function BidStatusBadge({ status }: { status: BidStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BID_STYLES[status]}`}
    >
      {BID_STATUS_LABELS[status]}
    </span>
  );
}
