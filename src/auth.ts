import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";
import { isRateLimited, clearRateLimit } from "@/lib/rate-limit";

// Хэш несуществующего пароля — сравниваем с ним, когда пользователь не найден,
// чтобы время ответа не отличалось от случая "пользователь есть, пароль неверный".
// Без этого по разнице в задержке можно было бы перебором узнавать, какие email
// зарегистрированы (user enumeration через timing side-channel).
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Q9E5ZK7cWn5vv/aEQz5H2G8mYQ8Wm";

const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

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

        if (isRateLimited(`login:${normalizedEmail}`, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS)) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user || !valid) return null;

        clearRateLimit(`login:${normalizedEmail}`);

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
