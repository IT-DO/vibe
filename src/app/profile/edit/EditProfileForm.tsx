"use client";

import { useActionState } from "react";
import type { User } from "@prisma/client";
import { updateProfileAction } from "@/lib/actions/profile";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function EditProfileForm({ user }: { user: User }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        Имя
        <input name="name" required defaultValue={user.name} className="input mt-1" />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Город
        <input name="city" defaultValue={user.city ?? ""} className="input mt-1" />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        О себе
        <textarea name="bio" rows={4} defaultValue={user.bio ?? ""} className="input mt-1" />
      </label>

      {user.role === "EXECUTOR" && (
        <>
          <label className="block text-sm font-medium text-slate-700">
            Специализация
            <input
              name="specialization"
              defaultValue={user.specialization ?? ""}
              placeholder="Например: функциональные прототипы, миниатюры"
              className="input mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Материалы
            <input
              name="materials"
              defaultValue={user.materials ?? ""}
              placeholder="PLA, PETG, ABS, Resin..."
              className="input mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Оборудование
            <input name="printer" defaultValue={user.printer ?? ""} className="input mt-1" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Цена, ₽ / г
            <input
              name="pricePerGram"
              type="number"
              min={0}
              step="0.1"
              defaultValue={user.pricePerGram ?? ""}
              className="input mt-1"
            />
          </label>
        </>
      )}

      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Профиль обновлён.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
      >
        {pending ? "Сохраняем..." : "Сохранить"}
      </button>
    </form>
  );
}
