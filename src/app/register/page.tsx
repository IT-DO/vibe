"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "@/lib/actions/auth";
import { ROLE_LABELS } from "@/lib/constants";

const initialState: ActionState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-slate-900">Регистрация</h1>
      <p className="mt-1 text-sm text-slate-500">
        Создайте аккаунт заказчика или исполнителя.
      </p>

      <form action={formAction} className="mt-8 space-y-5">
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-2 text-sm font-medium text-slate-700">Я хочу...</legend>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="CUSTOMER" defaultChecked className="accent-orange-600" />
            Заказывать печать
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="EXECUTOR" className="accent-orange-600" />
            Печатать заказы
          </label>
        </fieldset>

        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-700">
            Имя
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {state.fieldErrors?.name && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.name[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {state.fieldErrors?.email && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.email[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Пароль
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          {state.fieldErrors?.password && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.password[0]}</p>
          )}
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
        >
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
        Роли: {ROLE_LABELS.CUSTOMER} / {ROLE_LABELS.EXECUTOR}
      </p>
    </div>
  );
}
