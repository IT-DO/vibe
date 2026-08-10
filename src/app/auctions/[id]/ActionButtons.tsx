import {
  acceptBidAction,
  cancelOrderAction,
  completeOrderAction,
  startProgressAction,
} from "@/lib/actions/orders";
import type { OrderStatus } from "@/lib/constants";

export function AcceptBidButton({ bidId }: { bidId: string }) {
  async function accept() {
    "use server";
    await acceptBidAction(bidId);
  }

  return (
    <form action={accept} className="mt-1">
      <button
        type="submit"
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
      >
        Выбрать
      </button>
    </form>
  );
}

export function LifecycleButtons({ orderId, status }: { orderId: string; status: OrderStatus }) {
  if (status === "COMPLETED" || status === "CANCELLED") return null;

  async function start() {
    "use server";
    await startProgressAction(orderId);
  }
  async function complete() {
    "use server";
    await completeOrderAction(orderId);
  }
  async function cancel() {
    "use server";
    await cancelOrderAction(orderId);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Управление заказом</h2>
      <div className="flex flex-col gap-2">
        {status === "AWARDED" && (
          <form action={start}>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Отметить «в печати»
            </button>
          </form>
        )}
        {(status === "AWARDED" || status === "IN_PROGRESS") && (
          <form action={complete}>
            <button
              type="submit"
              className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Заказ выполнен
            </button>
          </form>
        )}
        {(status === "OPEN" || status === "AWARDED") && (
          <form action={cancel}>
            <button
              type="submit"
              className="w-full rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Отменить заказ
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
