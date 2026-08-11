import "server-only";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { localeRedirect } from "@/lib/i18n/redirect";

// Не залогинен — отправляем на /login (после входа сам решит, куда идти
// дальше). Залогинен, но не ADMIN — notFound(), а не "403 Forbidden": так
// раздел администрирования не выдаёт даже сам факт своего существования
// обычным пользователям.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return await localeRedirect("/login");
  if (session.user.role !== "ADMIN") notFound();
  return session;
}
