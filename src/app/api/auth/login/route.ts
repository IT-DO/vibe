import { findUserByEmail, normalizeEmail, verifyPassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/yookassa";

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  if (!rateLimit(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return Response.json({ error: "Слишком много попыток. Подожди 15 минут." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const user = findUserByEmail(normalizeEmail(body.email ?? ""));

  // Один и тот же текст для "нет такого пользователя" и "неверный пароль":
  // иначе форма превращается в удобный способ узнать, кто у тебя зарегистрирован.
  const failed = Response.json({ error: "Неверная почта или пароль" }, { status: 401 });
  if (!user) return failed;
  if (!verifyPassword(body.password ?? "", user.password_hash)) return failed;

  await createSession(user.id);
  return Response.json({ ok: true });
}
