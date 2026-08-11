"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { updateSettings, type SettingsPatch } from "@/lib/settings";
import type { ActionState } from "@/lib/actions/auth";
import { TAX_SYSTEM_OPTIONS, VAT_OPTIONS } from "@/lib/constants";

const SECRET_FIELDS = ["smtpPass", "yookassaSecretKey", "internalAlertToken"] as const;
const OPTIONAL_STRING_FIELDS = ["appUrl", "smtpHost", "smtpUser", "mailFrom", "yookassaShopId", "alertEmail"] as const;

const settingsSchema = z.object({
  subscriptionPriceRub: z.coerce.number().int().min(0).max(1_000_000),
  subscriptionPeriodDays: z.coerce.number().int().min(1).max(3650),
  commissionRatePercent: z.coerce.number().min(0).max(100),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  // Коды приходят из <select> с фиксированным набором значений, но валидируем
  // всё равно — форму можно отправить и в обход интерфейса.
  taxSystemCode: z.coerce.number().int().refine((v) => TAX_SYSTEM_OPTIONS.some((o) => o.code === v), "Некорректная система налогообложения"),
  vatCode: z.coerce.number().int().refine((v) => VAT_OPTIONS.some((o) => o.code === v), "Некорректная ставка НДС"),
});

// Значения приходят строками из FormData — пустая строка для необязательного
// текстового поля означает "вернуться к .env/умолчанию" (сохраняем как null).
function optionalString(value: FormDataEntryValue | null): string | null {
  const str = typeof value === "string" ? value.trim() : "";
  return str === "" ? null : str;
}

export async function updateSettingsAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = settingsSchema.safeParse({
    subscriptionPriceRub: formData.get("subscriptionPriceRub"),
    subscriptionPeriodDays: formData.get("subscriptionPeriodDays"),
    commissionRatePercent: formData.get("commissionRatePercent"),
    smtpPort: formData.get("smtpPort"),
    taxSystemCode: formData.get("taxSystemCode"),
    vatCode: formData.get("vatCode"),
  });
  if (!parsed.success) {
    return { error: "Проверьте числовые поля — введены некорректные значения." };
  }

  const patch: SettingsPatch = {
    subscriptionPriceRub: parsed.data.subscriptionPriceRub,
    subscriptionPeriodDays: parsed.data.subscriptionPeriodDays,
    commissionRatePercent: parsed.data.commissionRatePercent,
    smtpPort: parsed.data.smtpPort,
    taxSystemCode: parsed.data.taxSystemCode,
    vatCode: parsed.data.vatCode,
    subscriptionEnforced: formData.get("subscriptionEnforced") === "on",
  };

  for (const field of OPTIONAL_STRING_FIELDS) {
    patch[field] = optionalString(formData.get(field));
  }

  // Секретные поля: пусто и без галочки "очистить" — не трогаем сохранённое
  // значение (undefined-поля в SettingsPatch игнорируются в updateSettings).
  // Галочка "очистить" — явно возвращаемся к .env (null). Непустое значение —
  // заменяем секрет.
  for (const field of SECRET_FIELDS) {
    const shouldClear = formData.get(`clear_${field}`) === "on";
    const raw = optionalString(formData.get(field));
    if (shouldClear) {
      patch[field] = null;
    } else if (raw !== null) {
      patch[field] = raw;
    }
  }

  await updateSettings(patch);
  revalidatePath("/admin/settings");
  revalidatePath("/billing");
  revalidatePath("/offer");
  return { success: true };
}

export async function generateAlertTokenAction(): Promise<ActionState> {
  await requireAdmin();
  const token = randomBytes(24).toString("hex");
  await updateSettings({ internalAlertToken: token });
  revalidatePath("/admin/settings");
  return { success: true };
}
