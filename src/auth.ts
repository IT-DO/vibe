import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

// Хэш несуществующего пароля — сравниваем с ним, когда пользователь не найден,
// чтобы время ответа не отличалось от случая "пользователь есть, пароль неверный".
// Без этого по разнице в задержке можно было бы перебором узнавать, какие email
// зарегистрированы (user enumeration через timing side-channel).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q9E5ZK7cWn5vv/aEQz5H2G8mYQ8Wm";

// Простой rate-limit на попытки входа по email, в памяti процесса. Этого
// достаточно для одного инстанса (наш self-hosted деплой); при горизонтальном
// масштабировании на несколько инстансов нужен общий стор (Redis и т.п.).
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LOGIN_ATTEMPT_LIMIT;
}

function clearRateLimit(key: string) {
  loginAttempts.delete(key);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const normalizedEmail = email.toLowerCase().trim();

        if (isRateLimited(normalizedEmail)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) return null;

        clearRateLimit(normalizedEmail);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as Role,
        };
      },
    }),
  ],
  callbacks: {
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    session: async ({ session, token }) => {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
