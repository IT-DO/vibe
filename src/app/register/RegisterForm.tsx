"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction, type ActionState } from "@/lib/actions/auth";
import type { Dictionary } from "@/lib/i18n/locales/ru";

const initialState: ActionState = {};

export function RegisterForm({ t }: { t: Dictionary["auth"] }) {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">{t.registerTitle}</h1>
      <p className="mt-1 text-sm text-slate-500">{t.registerSubtitle}</p>

      <form action={formAction} className="mt-8 space-y-5">
        <fieldset className="grid grid-cols-1 gap-3">
          <legend className="mb-2 text-sm font-medium text-slate-700">{t.iWantTo}</legend>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="CUSTOMER" defaultChecked className="accent-orange-600" />
            {t.wantOrder}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="EXECUTOR" className="accent-orange-600" />
            {t.wantPrint}
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-3 text-sm transition hover:border-slate-400 has-[:checked]:border-orange-500 has-[:checked]:bg-orange-50">
            <input type="radio" name="role" value="DESIGNER" className="accent-orange-600" />
            {t.wantDesign}
          </label>
        </fieldset>

        <label className="block text-sm font-medium text-slate-700">
          {t.name}
          <input id="name" name="name" type="text" required className="input mt-1" />
          {state.fieldErrors?.name && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.name[0]}</span>
          )}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          {t.email}
          <input id="email" name="email" type="email" required className="input mt-1" />
          {state.fieldErrors?.email && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.email[0]}</span>
          )}
        </label>

        <label className="block text-sm font-medium text-slate-700">
          {t.password}
          <input id="password" name="password" type="password" required minLength={6} className="input mt-1" />
          {state.fieldErrors?.password && (
            <span className="mt-1 block text-xs font-normal text-red-600">{state.fieldErrors.password[0]}</span>
          )}
        </label>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}

        <button type="submit" disabled={pending} className="btn-primary btn-block">
          {pending ? t.creating : t.signUp}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        {t.haveAccount}{" "}
        <Link href="/login" className="font-medium text-orange-600 hover:underline">
          {t.loginLink}
        </Link>
      </p>
    </>
  );
}
