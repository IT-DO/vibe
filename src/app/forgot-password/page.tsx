"use client";

import { useActionState } from "react";
import { LocaleLink as Link } from "@/components/LocaleLink";
import { requestPasswordResetAction } from "@/lib/actions/password-reset";
import type { ActionState } from "@/lib/actions/auth";
import { AuthShell } from "@/components/AuthShell";

const initialState: ActionState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-900">Восстановление пароля</h1>
      <p className="mt-1 text-sm text-slate-500">
        Введите email, указанный при регистрации — пришлём ссылку для сброса пароля.
      </p>

      {state.success ? (
        <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Если такой email зарегистрирован, на него отправлена ссылка для сброса пароля. Она
          действует 1 час.
        </p>
      ) : (
        <form action={formAction} className="mt-8 space-y-5">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input name="email" type="email" required className="input mt-1" />
          </label>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
          )}

          <button type="submit" disabled={pending} className="btn-primary btn-block">
            {pending ? "Отправляем..." : "Отправить ссылку"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          Вернуться ко входу
        </Link>
      </p>
    </AuthShell>
  );
}
