import "server-only";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";

// Не залогинен — отправляем на /login (после входа сам решит, куда идти
// дальше). Залогинен, но не ADMIN — notFound(), а не "403 Forbidden": так
// раздел администрирования не выдаёт даже сам факт своего существования
// обычным пользователям.
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") notFound();
  return session;
}
