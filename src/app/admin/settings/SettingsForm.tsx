"use client";

import { useActionState } from "react";
import { updateSettingsAction, generateAlertTokenAction } from "@/lib/actions/admin";
import type { ActionState } from "@/lib/actions/auth";
import type { AdminSettingsView } from "@/lib/settings";

const initialState: ActionState = {};

export function SettingsForm({ initial }: { initial: AdminSettingsView }) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, initialState);
  // useActionState требует функцию вида (state, formData) => Promise<state>,
  // хотя генерации токена никакие данные формы не нужны.
  const [tokenState, generateToken, generatingToken] = useActionState(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async (prevState: ActionState, formData: FormData) => generateAlertTokenAction(),
    initialState
  );

  return (
    <div className="mt-6 space-y-6">
      <form action={formAction} className="space-y-6">
        <Section title="Подписка и комиссия">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Цена подписки, ₽/период">
              <input
                name="subscriptionPriceRub"
                type="number"
                min={0}
                defaultValue={initial.subscriptionPriceRub}
                className="input"
              />
            </Field>
            <Field label="Длительность периода, дней">
              <input
                name="subscriptionPeriodDays"
                type="number"
                min={1}
                defaultValue={initial.subscriptionPeriodDays}
                className="input"
              />
            </Field>
            <Field label="Комиссия площадки, %">
              <input
                name="commissionRatePercent"
                type="number"
                min={0}
                max={100}
                step={0.1}
                defaultValue={initial.commissionRatePercent}
                className="input"
              />
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                name="subscriptionEnforced"
                defaultChecked={initial.subscriptionEnforced}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              Требовать активную подписку для заказов/ставок
            </label>
          </div>
        </Section>

        <Section title="Публичный адрес сайта">
          <Field label="APP_URL (для писем и возврата после оплаты)">
            <input name="appUrl" placeholder="https://your-domain.example" defaultValue={initial.appUrl} className="input" />
          </Field>
          <p className="mt-1 text-xs text-slate-400">
            Пусто — адрес определяется автоматически по заголовкам запроса.
          </p>
        </Section>

        <Section title="ЮKassa">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Shop ID">
              <input name="yookassaShopId" defaultValue={initial.yookassaShopId} className="input" />
            </Field>
            <SecretField
              name="yookassaSecretKey"
              label="Секретный ключ"
              isSet={initial.yookassaSecretKey.isSet}
              fromEnv={initial.yookassaSecretKey.fromEnv}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Без обоих полей оплата подписки/комиссии работает в демо-режиме (платёж
            отмечается оплаченным сразу, без реального провайдера).
          </p>
        </Section>

        <Section title="Почта (SMTP)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Хост">
              <input name="smtpHost" defaultValue={initial.smtpHost} className="input" />
            </Field>
            <Field label="Порт">
              <input name="smtpPort" type="number" min={1} max={65535} defaultValue={initial.smtpPort} className="input" />
            </Field>
            <Field label="Пользователь">
              <input name="smtpUser" defaultValue={initial.smtpUser} className="input" />
            </Field>
            <SecretField
              name="smtpPass"
              label="Пароль"
              isSet={initial.smtpPass.isSet}
              fromEnv={initial.smtpPass.fromEnv}
            />
            <Field label="От кого (From)">
              <input
                name="mailFrom"
                placeholder="PrintAukcion <noreply@your-domain.example>"
                defaultValue={initial.mailFrom}
                className="input"
              />
            </Field>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Без SMTP письма (сброс пароля, уведомления) только логируются на сервере —
            это по-прежнему безопасно, но пользователь реально письма не получит.
          </p>
        </Section>

        <Section title="Алерты (нехватка диска и т.п.)">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email для алертов">
              <input name="alertEmail" defaultValue={initial.alertEmail} className="input" />
            </Field>
            <SecretField
              name="internalAlertToken"
              label="Токен внутреннего API"
              isSet={initial.internalAlertToken.isSet}
              fromEnv={initial.internalAlertToken.fromEnv}
            />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Этот токен должен совпадать со значением <code>INTERNAL_ALERT_TOKEN</code> в
            .env на хосте — <code>scripts/check-disk.sh</code> запускается вне
            приложения и читает токен только оттуда.
          </p>
        </Section>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        {state.success && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Настройки сохранены.</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-60"
        >
          {pending ? "Сохраняем..." : "Сохранить настройки"}
        </button>
      </form>

      <form action={generateToken} className="border-t border-slate-200 pt-4">
        <button
          type="submit"
          disabled={generatingToken}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {generatingToken ? "Генерируем..." : "Сгенерировать новый токен алертов"}
        </button>
        {tokenState.success && (
          <p className="mt-2 text-sm text-emerald-700">
            Новый токен сохранён. Обновите <code>INTERNAL_ALERT_TOKEN</code> в .env на
            хосте тем же значением — оно не показывается здесь из соображений
            безопасности, но вы можете задать его вручную полем выше вместо генерации.
          </p>
        )}
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-5">
      <legend className="px-1 text-sm font-bold text-slate-900">{title}</legend>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function SecretField({
  name,
  label,
  isSet,
  fromEnv,
}: {
  name: string;
  label: string;
  isSet: boolean;
  fromEnv: boolean;
}) {
  return (
    <Field
      label={`${label}${isSet ? (fromEnv ? " (задано в .env)" : " (задано)") : " (не задано)"}`}
    >
      <input
        name={name}
        type="password"
        placeholder={isSet ? "•••••••• — оставить как есть" : "не задано"}
        autoComplete="new-password"
        className="input"
      />
      <label className="mt-1 flex items-center gap-1.5 text-xs font-normal text-slate-500">
        <input type="checkbox" name={`clear_${name}`} className="h-3.5 w-3.5 rounded border-slate-300" />
        Очистить (вернуться к значению из .env)
      </label>
    </Field>
  );
}
