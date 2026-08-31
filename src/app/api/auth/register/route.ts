import { createUser, findUserByEmail, isValidEmail, normalizeEmail } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/yookassa";

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    return Response.json({ error: "Слишком много попыток. Попробуй через час." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = normalizeEmail(body.email ?? "");
  const password = body.password ?? "";

  if (!isValidEmail(email)) {
    return Response.json({ error: "Проверь адрес почты" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Пароль должен быть не короче 8 символов" }, { status: 400 });
  }
  if (findUserByEmail(email)) {
    return Response.json({ error: "Такая почта уже зарегистрирована" }, { status: 409 });
  }

  const user = createUser(email, password);
  await createSession(user.id);
  return Response.json({ ok: true });
}
