"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction, type ActionState } from "@/lib/actions/auth";
import { AuthShell } from "@/components/AuthShell";

const initialState: ActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-900">Вход</h1>
      <p className="mt-1 text-sm text-slate-500">
        Демо-аккаунты: anna@example.com / password123 (заказчик), print.master@example.com / password123 (исполнитель).
      </p>

      {justReset && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Пароль изменён — теперь можно войти с новым паролем.
        </p>
      )}

      <form action={formAction} className="mt-8 space-y-5">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input id="email" name="email" type="email" required className="input mt-1" />
        </label>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Пароль
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-orange-600 hover:underline">
              Забыли пароль?
            </Link>
          </div>
          <input id="password" name="password" type="password" required className="input mt-1" />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button type="submit" disabled={pending} className="btn-primary btn-block">
          {pending ? "Входим..." : "Войти"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-orange-600 hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </AuthShell>
  );
}
