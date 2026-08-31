"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      router.push("/app");
      router.refresh(); // чтобы шапка сразу показала баланс
      return;
    }

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "Не получилось. Попробуй ещё раз.");
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm">
      <h1 className="text-2xl font-semibold tracking-tight">
        {isRegister ? "Регистрация" : "Вход"}
      </h1>
      {isRegister && (
        <p className="mt-2 text-muted">Три карточки бесплатно, карта не нужна.</p>
      )}

      <label className="mt-6 block text-sm font-medium">
        Почта
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-brand"
        />
      </label>

      <label className="mt-4 block text-sm font-medium">
        Пароль
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={isRegister ? "new-password" : "current-password"}
          className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-brand"
        />
        {isRegister && <span className="mt-1 block text-xs text-muted">Минимум 8 символов</span>}
      </label>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? "Секунду…" : isRegister ? "Создать аккаунт" : "Войти"}
      </button>

      <p className="mt-5 text-sm text-muted">
        {isRegister ? (
          <>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-brand hover:underline">
              Войти
            </Link>
          </>
        ) : (
          <>
            Нет аккаунта?{" "}
            <Link href="/register" className="text-brand hover:underline">
              Зарегистрироваться
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
