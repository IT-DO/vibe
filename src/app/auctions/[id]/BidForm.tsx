"use client";

import { useActionState } from "react";
import { placeBidAction } from "@/lib/actions/orders";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function BidForm({
  orderId,
  initial,
}: {
  orderId: string;
  initial?: { price: number; leadTimeDays: number; message: string | null };
}) {
  const [state, formAction, pending] = useActionState(placeBidAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Цена, ₽
          <input
            name="price"
            type="number"
            min={1}
            required
            defaultValue={initial?.price}
            className="input mt-1"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Срок, дней
          <input
            name="leadTimeDays"
            type="number"
            min={1}
            required
            defaultValue={initial?.leadTimeDays}
            className="input mt-1"
          />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Сообщение (опционально)
        <textarea
          name="message"
          rows={3}
          defaultValue={initial?.message ?? ""}
          placeholder="Опыт, примеры похожих работ, уточняющие вопросы..."
          className="input mt-1"
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.fieldErrors?.price && <p className="text-sm text-red-600">{state.fieldErrors.price[0]}</p>}
      {state.fieldErrors?.leadTimeDays && (
        <p className="text-sm text-red-600">{state.fieldErrors.leadTimeDays[0]}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary btn-block"
      >
        {pending ? "Отправляем..." : initial ? "Обновить ставку" : "Сделать ставку"}
      </button>
    </form>
  );
}
