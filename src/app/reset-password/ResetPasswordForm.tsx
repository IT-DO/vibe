"use client";

import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/actions/password-reset";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={formAction} className="mt-8 space-y-5">
      <input type="hidden" name="token" value={token} />

      <label className="block text-sm font-medium text-slate-700">
        Новый пароль
        <input name="password" type="password" required minLength={6} className="input mt-1" />
        {state.fieldErrors?.password && (
          <p className="mt-1 text-xs font-normal text-red-600">{state.fieldErrors.password[0]}</p>
        )}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Повторите пароль
        <input name="confirmPassword" type="password" required minLength={6} className="input mt-1" />
        {state.fieldErrors?.confirmPassword && (
          <p className="mt-1 text-xs font-normal text-red-600">
            {state.fieldErrors.confirmPassword[0]}
          </p>
        )}
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary btn-block">
        {pending ? "Сохраняем..." : "Сохранить новый пароль"}
      </button>
    </form>
  );
}
