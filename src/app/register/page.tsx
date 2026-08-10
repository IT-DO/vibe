"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";
import { AuthShell } from "@/components/AuthShell";

const initialState: ActionState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold text-slate-900">Регистрация</h1>
      <p className="mt-1 text-sm text-slate-500">
        Создайте аккаунт заказчика или исполнителя.
      </p>

      <form action={formAction} className="mt-8 space-y-5">
        <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium text-slate-700">Я хочу...</legend>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="CUSTOMER" defaultChecked className="accent-orange-600" />
            Заказывать печать
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="EXECUTOR" className="accent-orange-600" />
            Печатать заказы
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="DESIGNER" className="accent-orange-600" />
            Создавать 3D-модели
          </label>
        </fieldset>

        <label className="block text-sm font-medium text-slate-700">
          Имя
          <input id="name" name="name" type="text" required className="input mt-1" />
          {state.fieldErrors?.name && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.name[0]}</span>
          )}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Email
          <input id="email" name="email" type="email" required className="input mt-1" />
          {state.fieldErrors?.email && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.email[0]}</span>
          )}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          Пароль
          <input id="password" name="password" type="password" required minLength={6} className="input mt-1" />
          {state.fieldErrors?.password && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.password[0]}</span>
          )}
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button type="submit" disabled={pending} className="btn-primary btn-block">
          {pending ? "Создаём аккаунт..." : "Зарегистрироваться"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          Войти
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-slate-400">
        Роли: {ROLE_LABELS.CUSTOMER} / {ROLE_LABELS.EXECUTOR} / {ROLE_LABELS.DESIGNER}
      </p>
    </AuthShell>
  );
}
