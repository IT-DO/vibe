import crypto from "node:crypto";
import { cookies } from "next/headers";
import { db, type UserRow } from "./db";
import { findUserById } from "./auth";

const COOKIE = "sid";
const TTL_DAYS = 30;

/**
 * Сессии в базе, а не в JWT.
 *
 * Плюс: можно мгновенно разлогинить кого угодно (удалил строку - и всё).
 * Минус: поход в базу на каждый запрос. На SQLite это микросекунды,
 * так что для нашего масштаба плюс перевешивает.
 */

export async function createSession(userId: number): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expires.toISOString(),
  );

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true, // JavaScript на странице не может прочитать этот cookie
    sameSite: "lax", // защита от CSRF: cookie не уйдёт на чужой сайт
    secure: process.env.NODE_ENV === "production", // только по HTTPS на проде
    path: "/",
    expires,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  jar.delete(COOKIE);
}

/** Текущий пользователь или null. Заодно чистит протухшие сессии. */
export async function currentUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token = ?")
    .get(token) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return findUserById(row.user_id) ?? null;
}
