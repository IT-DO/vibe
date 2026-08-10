"use client";

import { useActionState } from "react";
import { useState } from "react";
import { updateProfileAction } from "@/lib/actions/profile";
import type { ActionState } from "@/lib/actions/auth";
import { PROFILE_FIELD_LABELS, type Role } from "@/lib/constants";
import type { getOwnProfile } from "@/lib/users";

type OwnProfile = NonNullable<Awaited<ReturnType<typeof getOwnProfile>>>;

const initialState: ActionState = {};

export function EditProfileForm({ user }: { user: OwnProfile }) {
  const [state, formAction, pending] = useActionState(updateProfileAction, initialState);
  const isSpecialist = user.role === "EXECUTOR" || user.role === "DESIGNER";
  const [role] = useState(user.role as Role);
  const labels = isSpecialist ? PROFILE_FIELD_LABELS[role as "EXECUTOR" | "DESIGNER"] : null;

  return (
    <form action={formAction} className="space-y-5">
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

      {isSpecialist && labels && (
        <>
          <label className="block text-sm font-medium text-slate-700">
            {labels.specialization}
            <input
              name="specialization"
              defaultValue={user.specialization ?? ""}
              placeholder={
                role === "DESIGNER"
                  ? "Например: инженерный CAD, топологическая оптимизация"
                  : "Например: функциональные прототипы, миниатюры"
              }
              className="input mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {labels.materials}
            <input
              name="materials"
              defaultValue={user.materials ?? ""}
              placeholder={role === "DESIGNER" ? "STL, STEP, OBJ..." : "PLA, PETG, ABS, Resin..."}
              className="input mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {labels.printer}
            <input
              name="printer"
              defaultValue={user.printer ?? ""}
              placeholder={role === "DESIGNER" ? "Fusion 360, Blender, SolidWorks..." : undefined}
              className="input mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            {labels.price}
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

      <button type="submit" disabled={pending} className="btn-primary btn-block">
        {pending ? "Сохраняем..." : "Сохранить"}
      </button>
    </form>
  );
}
