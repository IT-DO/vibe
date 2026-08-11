"use client";

import { useActionState, useRef } from "react";
import { changePasswordAction } from "@/lib/actions/profile";
import type { ActionState } from "@/lib/actions/auth";

const initialState: ActionState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        // Не оставляем пароли в полях после успешной отправки.
        formRef.current?.reset();
      }}
      className="space-y-5"
    >
      <label className="block text-sm font-medium text-slate-700">
        Текущий пароль
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className="input mt-1"
        />
        {state.fieldErrors?.currentPassword && (
          <span className="mt-1 block text-xs font-normal text-red-600">
            {state.fieldErrors.currentPassword[0]}
          </span>
        )}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Новый пароль
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="input mt-1"
        />
        {state.fieldErrors?.password && (
          <span className="mt-1 block text-xs font-normal text-red-600">
            {state.fieldErrors.password[0]}
          </span>
        )}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Повторите новый пароль
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="input mt-1"
        />
        {state.fieldErrors?.confirmPassword && (
          <span className="mt-1 block text-xs font-normal text-red-600">
            {state.fieldErrors.confirmPassword[0]}
          </span>
        )}
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Пароль изменён. Активные сессии на других устройствах при этом не
          завершаются — при подозрении на доступ посторонних выйдите из аккаунта там вручную.
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary btn-block">
        {pending ? "Меняем..." : "Сменить пароль"}
      </button>
    </form>
  );
}
