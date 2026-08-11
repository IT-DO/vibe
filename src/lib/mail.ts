import "server-only";
import nodemailer from "nodemailer";
import { getSettings } from "@/lib/settings";

// Заголовки писем (subject и т.п.) иногда собираются из пользовательского
// текста (название заказа, имя автора отзыва) — вырезаем переводы строк,
// чтобы исключить SMTP header injection, даже если nodemailer сам по себе
// уже безопасно кодирует такие значения.
export function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export async function isMailConfigured(): Promise<boolean> {
  const settings = await getSettings();
  return Boolean(settings.smtpHost && settings.smtpUser && settings.smtpPass);
}

// Транспорт не кэшируем на уровне модуля: конфигурация SMTP может смениться
// в любой момент через админку, а создание транспорта — дешёвая операция
// (соединение открывается только при реальной отправке).
function buildTransporter(settings: Awaited<ReturnType<typeof getSettings>>) {
  return nodemailer.createTransport({
    host: settings.smtpHost ?? undefined,
    port: settings.smtpPort,
    secure: settings.smtpPort === 465,
    auth: { user: settings.smtpUser ?? undefined, pass: settings.smtpPass ?? undefined },
  });
}

// Не используем nodemailer-опцию "raw" нигде в проекте — у неё была известная
// уязвимость (обход disableFileAccess/disableUrlAccess, произвольное чтение
// файлов/SSRF через письмо), поэтому пакет закреплён на пропатченной версии
// в package.json и письма всегда собираются только через to/subject/text/html.
export async function sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const settings = await getSettings();
  if (!(settings.smtpHost && settings.smtpUser && settings.smtpPass)) {
    // Демо-режим без SMTP: письмо только логируется на сервере. Это
    // осознанно НЕ показывается в браузере инициатору запроса — иначе,
    // например, сброс пароля по чужому email превратился бы в захват
    // аккаунта (см. src/lib/actions/password-reset.ts).
    console.log(
      `[mail:demo] Письмо не отправлено (SMTP не настроен). Кому: ${params.to}\nТема: ${params.subject}\n${params.text}`
    );
    return;
  }

  await buildTransporter(settings).sendMail({
    from: settings.mailFrom || settings.smtpUser,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}

// Для второстепенных уведомлений (новая ставка, новый отзыв и т.п.) — сбой
// отправки письма не должен ронять основное действие пользователя (ставку,
// принятие ставки, отзыв), поэтому ошибка только логируется.
export async function sendMailSafe(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  try {
    await sendMail(params);
  } catch (err) {
    console.error("sendMailSafe: failed to send notification email", err);
  }
}
