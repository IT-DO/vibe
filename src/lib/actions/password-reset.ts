"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { isRateLimited } from "@/lib/rate-limit";
import { getAppOrigin } from "@/lib/origin";
import type { ActionState } from "@/lib/actions/auth";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 час
const REQUEST_LIMIT = 3;
const REQUEST_WINDOW_MS = 15 * 60 * 1000;
// Отдельный, более широкий лимит по IP — иначе форму можно использовать как
// генератор писем на произвольные адреса (спам через нашу почтовую
// репутацию), просто подставляя разные email по одному запросу на каждый.
const IP_REQUEST_LIMIT = 20;
const IP_REQUEST_WINDOW_MS = 15 * 60 * 1000;

// Без реверс-прокси перед приложением (см. docker-compose.https.yml)
// X-Forwarded-For может быть пустым или, в теории, подделан клиентом напрямую
// — этот лимит не заменяет лимит по email выше, а дополняет его как более
// широкую защиту от рассылки писем на много разных адресов подряд.
async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

const requestSchema = z.object({ email: z.string().trim().toLowerCase().email() });

// Всегда возвращает { success: true } независимо от того, найден ли email в
// базе — иначе форма сброса пароля становится инструментом проверки
// "зарегистрирован ли этот email на площадке" (user enumeration). Конкретный
// текст сообщения — на стороне UI (ForgotPasswordForm).
export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = requestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Введите корректный email" };
  const { email } = parsed.data;

  const ip = await getClientIp();
  const limited =
    isRateLimited(`pwreset:${email}`, REQUEST_LIMIT, REQUEST_WINDOW_MS) ||
    isRateLimited(`pwreset-ip:${ip}`, IP_REQUEST_LIMIT, IP_REQUEST_WINDOW_MS);
  if (limited) {
    // Тот же ответ, что и при успехе — лимит по частоте не должен выдавать,
    // существует ли email (см. комментарий выше функции).
    return { success: true };
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });

  if (user) {
    // Предыдущие неиспользованные ссылки инвалидируем — активна максимум одна.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    const rawToken = randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const origin = await getAppOrigin();
    const resetUrl = `${origin}/reset-password?token=${rawToken}`;

    await sendMail({
      to: email,
      subject: "Восстановление пароля — PrintAu",
      text: `Здравствуйте, ${user.name}!\n\nЧтобы сбросить пароль, перейдите по ссылке (действует 1 час):\n${resetUrl}\n\nЕсли вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    });
  }

  return { success: true };
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(6, "Пароль должен быть не короче 6 символов").max(100),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  });

export async function resetPasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { token, password } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    return { error: "Ссылка недействительна или устарела. Запросите сброс пароля заново." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // На всякий случай гасим и остальные активные ссылки этого пользователя.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=1");
}
