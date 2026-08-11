"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/auth";
import { isRateLimited, clearRateLimit } from "@/lib/rate-limit";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().max(100).optional().or(z.literal("")),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  specialization: z.string().trim().max(200).optional().or(z.literal("")),
  materials: z.string().trim().max(200).optional().or(z.literal("")),
  printer: z.string().trim().max(200).optional().or(z.literal("")),
  pricePerGram: z.coerce.number().min(0).max(100000).optional(),
});

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    bio: formData.get("bio"),
    specialization: formData.get("specialization"),
    materials: formData.get("materials"),
    printer: formData.get("printer"),
    pricePerGram: formData.get("pricePerGram") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { name, city, bio, specialization, materials, printer, pricePerGram } = parsed.data;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name,
      city: city || null,
      bio: bio || null,
      ...(session.user.role === "EXECUTOR" || session.user.role === "DESIGNER"
        ? {
            specialization: specialization || null,
            materials: materials || null,
            printer: printer || null,
            pricePerGram: pricePerGram ?? null,
          }
        : {}),
    },
  });

  revalidatePath(`/u/${session.user.id}`);
  revalidatePath("/executors");
  return { success: true };
}

// --- Смена пароля из личного кабинета ---

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    password: z.string().min(6, "Пароль должен быть не короче 6 символов").max(100),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Пароли не совпадают",
    path: ["confirmPassword"],
  })
  .refine((d) => d.password !== d.currentPassword, {
    message: "Новый пароль совпадает с текущим",
    path: ["password"],
  });

export async function changePasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Ограничиваем перебор текущего пароля: без этого форма превращается в
  // оракул для проверки пароля у уже угнанной сессии.
  if (isRateLimited(`change-password:${session.user.id}`, 5, 15 * 60 * 1000)) {
    return { error: "Слишком много попыток. Попробуйте через 15 минут." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) return { error: "Пользователь не найден" };

  // Текущий пароль обязателен: иначе любой, кто получил доступ к чужой
  // открытой сессии, менял бы пароль и забирал аккаунт себе.
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return { fieldErrors: { currentPassword: ["Неверный текущий пароль"] } };

  clearRateLimit(`change-password:${session.user.id}`);

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.user.id }, data: { passwordHash } }),
    // Гасим висящие ссылки на сброс пароля — после сознательной смены они
    // не должны оставаться рабочими.
    prisma.passwordResetToken.updateMany({
      where: { userId: session.user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return { success: true };
}
