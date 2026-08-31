"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BuyButton({
  planId,
  loggedIn,
  highlight,
}: {
  planId: string;
  loggedIn: boolean;
  highlight?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (!loggedIn) {
      router.push("/register");
      return;
    }
    setBusy(true);
    setError(null);

    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };

    if (response.ok && data.url) {
      // Уводим на страницу оплаты ЮKassa. Обратно человек вернётся
      // на /app?payment=done - это return_url из lib/yookassa.ts.
      window.location.href = data.url;
      return;
    }
    setError(data.error ?? "Не получилось создать платёж.");
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={buy}
        disabled={busy}
        className={`mt-5 w-full rounded-lg px-4 py-3 font-medium disabled:opacity-60 ${
          highlight
            ? "bg-brand text-white hover:bg-brand-dark"
            : "border border-line bg-paper hover:border-brand hover:text-brand"
        }`}
      >
        {busy ? "Секунду…" : loggedIn ? "Оплатить" : "Начать бесплатно"}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </>
  );
}
