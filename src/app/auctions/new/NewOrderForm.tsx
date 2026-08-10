"use client";

import { useActionState } from "react";
import { createOrderAction } from "@/lib/actions/orders";
import type { ActionState } from "@/lib/actions/auth";
import { MATERIALS, ATTACHMENT_EXTENSIONS } from "@/lib/constants";

const ACCEPT_ATTR = Object.keys(ATTACHMENT_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(",");

const initialState: ActionState = {};

export function NewOrderForm() {
  const [state, formAction, pending] = useActionState(createOrderAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <Field label="Название заказа" error={state.fieldErrors?.title?.[0]}>
        <input
          name="title"
          required
          placeholder="Например: 10 миниатюр для настольной игры"
          className="input"
        />
      </Field>

      <Field label="Описание" error={state.fieldErrors?.description?.[0]}>
        <textarea
          name="description"
          required
          rows={5}
          placeholder="Опишите модель, требования к качеству, есть ли готовый STL/STEP-файл и т.д."
          className="input"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Материал" error={state.fieldErrors?.material?.[0]}>
          <select name="material" required defaultValue="" className="input">
            <option value="" disabled>
              Выберите материал
            </option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Цвет (опционально)">
          <input name="color" placeholder="Например: чёрный" className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Количество, шт." error={state.fieldErrors?.quantity?.[0]}>
          <input name="quantity" type="number" min={1} defaultValue={1} required className="input" />
        </Field>
        <Field label="Бюджет от, ₽">
          <input name="budgetMin" type="number" min={0} className="input" />
        </Field>
        <Field label="Бюджет до, ₽" error={state.fieldErrors?.budgetMax?.[0]}>
          <input name="budgetMax" type="number" min={0} className="input" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Приём ставок, дней" error={state.fieldErrors?.biddingDays?.[0]}>
          <select name="biddingDays" defaultValue="3" className="input">
            {[1, 2, 3, 5, 7, 14].map((d) => (
              <option key={d} value={d}>
                {d} {d === 1 ? "день" : "дней"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Срок готовности (опционально), дней">
          <input name="deadlineDays" type="number" min={1} placeholder="Например: 10" className="input" />
        </Field>
      </div>

      <Field label="Файлы (модели, чертежи, референсы) — опционально">
        <input type="file" name="files" multiple accept={ACCEPT_ATTR} className="input" />
        <p className="mt-1 text-xs font-normal text-slate-400">
          До 5 файлов, каждый до 20 МБ. Разрешены: {Object.keys(ATTACHMENT_EXTENSIONS).join(", ")}.
          Файлы увидят все авторизованные пользователи портала, которые смогут делать
          ставки — это нужно, чтобы оценить задачу перед ставкой (подробнее — в{" "}
          <a href="/privacy" target="_blank" className="text-orange-600 hover:underline">
            политике конфиденциальности
          </a>
          ).
        </p>
      </Field>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
      >
        {pending ? "Публикуем..." : "Опубликовать заказ"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 font-normal">{children}</div>
      {error && <p className="mt-1 text-xs font-normal text-red-600">{error}</p>}
    </label>
  );
}
