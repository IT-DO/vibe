import { createHash, timingSafeEqual } from "node:crypto";
import { sendMail, sanitizeHeaderValue } from "@/lib/mail";
import { getSettings } from "@/lib/settings";

// sha256 сначала — чтобы сравнивать буферы одинаковой длины (timingSafeEqual
// бросает исключение при разной длине, а сама эта разница длин уже могла бы
// быть замерена по времени ответа).
function tokensMatch(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Внутренний канал для алертов от скриптов на хосте (см. scripts/check-disk.sh),
// переиспользует уже настроенный SMTP приложения вместо отдельной почтовой
// инфраструктуры на хосте. Без заданного INTERNAL_ALERT_TOKEN эндпоинт
// полностью выключен (404), а не просто "не проверяет токен" — так его не
// видно и нечем злоупотребить на инстансах, где алерты не настраивались.
export async function POST(req: Request) {
  const settings = await getSettings();
  const expectedToken = settings.internalAlertToken;
  const alertEmail = settings.alertEmail;
  if (!expectedToken || !alertEmail) {
    return new Response("Not found", { status: 404 });
  }

  const token = req.headers.get("x-internal-token");
  if (!token || !tokensMatch(token, expectedToken)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const subject = body && typeof body === "object" && "subject" in body ? String((body as { subject: unknown }).subject) : "PrintAukcion alert";
  const text = body && typeof body === "object" && "text" in body ? String((body as { text: unknown }).text) : "";

  await sendMail({ to: alertEmail, subject: `[PrintAukcion] ${sanitizeHeaderValue(subject)}`, text });

  return new Response("OK", { status: 200 });
}
