"use client";

import { useActionState, useState } from "react";
import { leaveReviewAction } from "@/lib/actions/reviews";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function ReviewForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(leaveReviewAction, initialState);
  const [rating, setRating] = useState(5);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={`${n} звёзд`}
            className={`text-2xl leading-none ${n <= rating ? "text-amber-500" : "text-slate-300"}`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        name="comment"
        rows={3}
        placeholder="Расскажите, как прошла работа (опционально)"
        className="input"
      />

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {pending ? "Отправляем..." : "Отправить отзыв"}
      </button>
    </form>
  );
}
