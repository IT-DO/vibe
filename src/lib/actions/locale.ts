"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocaleAction(formData: FormData): Promise<void> {
  const value = formData.get("locale");
  // Значение приходит от клиента — принимаем только известные локали, иначе
  // в куку можно было бы записать произвольную строку.
  if (!isLocale(value)) return;

  (await cookies()).set(LOCALE_COOKIE, value, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
  });

  revalidatePath("/", "layout");
}
