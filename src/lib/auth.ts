import crypto from "node:crypto";
import { db, type UserRow } from "./db";

/**
 * Пароли храним как scrypt-хэш, а не как текст.
 *
 * scrypt встроен в Node - не нужна дополнительная библиотека, которую
 * потом придётся обновлять. Формат строки в базе: scrypt$<соль>$<хэш>.
 * Соль у каждого пользователя своя, поэтому два одинаковых пароля
 * дают разные хэши.
 */

const KEY_LEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, KEY_LEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, KEY_LEN);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;

  // timingSafeEqual, а не ===: обычное сравнение строк заканчивается на
  // первом несовпавшем байте, и по времени ответа можно подбирать хэш.
  return crypto.timingSafeEqual(candidate, expected);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Проверка e-mail без фанатизма: одна собака, точка в домене, без пробелов. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(normalizeEmail(email)) as UserRow | undefined;
}

export function findUserById(id: number): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function createUser(email: string, password: string): UserRow {
  const freeCredits = Number(process.env.FREE_CREDITS_ON_SIGNUP ?? 3);
  const info = db
    .prepare("INSERT INTO users (email, password_hash, credits) VALUES (?, ?, ?)")
    .run(normalizeEmail(email), hashPassword(password), freeCredits);
  return findUserById(Number(info.lastInsertRowid))!;
}
