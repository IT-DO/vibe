"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Card } from "@/lib/llm";

const FIELD =
  "mt-1.5 w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 outline-none focus:border-brand";

export default function Generator({ initialCredits }: { initialCredits: number }) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);
  const [marketplace, setMarketplace] = useState<"wildberries" | "ozon">("wildberries");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [features, setFeatures] = useState("");
  const [audience, setAudience] = useState("");

  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needCredits, setNeedCredits] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNeedCredits(false);

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marketplace, name, category, features, audience }),
    });
    const data = (await response.json().catch(() => ({}))) as {
      card?: Card;
      credits?: number;
      error?: string;
      needCredits?: boolean;
    };

    if (response.ok && data.card) {
      setCard(data.card);
      if (typeof data.credits === "number") setCredits(data.credits);
      // Счётчик в шапке рисуется на сервере. Без refresh он покажет
      // старое число, и человек решит, что кредит не списался.
      router.refresh();
    } else {
      setError(data.error ?? "Не получилось. Попробуй ещё раз.");
      setNeedCredits(Boolean(data.needCredits));
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
      <form onSubmit={generate} className="rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Новая карточка</h2>
          <span className="text-sm text-muted">
            Осталось: <strong className="text-ink">{credits}</strong>
          </span>
        </div>

        <div className="mt-5 flex gap-2">
          {(["wildberries", "ozon"] as const).map((mp) => (
            <button
              key={mp}
              type="button"
              onClick={() => setMarketplace(mp)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                marketplace === mp
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              {mp === "wildberries" ? "Wildberries" : "Ozon"}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-medium">
          Название товара
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Термокружка стальная 450 мл"
            className={FIELD}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Категория
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Посуда / термокружки"
            className={FIELD}
          />
        </label>

        <label className="mt-4 block text-sm font-medium">
          Характеристики
          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={5}
            placeholder={"Нержавеющая сталь, двойные стенки\nДержит тепло 8 часов\nКрышка с защитой от протекания\nЦвета: чёрный, белый, мятный"}
            className={FIELD}
          />
          <span className="mt-1 block text-xs text-muted">
            Чем конкретнее, тем лучше текст. Пиши списком, как есть.
          </span>
        </label>

        <label className="mt-4 block text-sm font-medium">
          Кто покупает <span className="font-normal text-muted">— необязательно</span>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="Офисные сотрудники, водители"
            className={FIELD}
          />
        </label>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            <p>{error}</p>
            {needCredits && (
              <Link href="/pricing" className="mt-1 inline-block font-medium underline">
                Пополнить
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-brand px-4 py-3 font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? "Пишем…" : "Сделать карточку"}
        </button>
      </form>

      <div>
        {!card && !busy && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            Заполни форму слева — результат появится здесь.
          </div>
        )}
        {busy && (
          <div className="rounded-2xl border border-line bg-paper p-10 text-center text-muted">
            Пишем текст. Обычно это 20–40 секунд.
          </div>
        )}
        {card && !busy && <Result card={card} />}
      </div>
    </div>
  );
}

function Result({ card }: { card: Card }) {
  return (
    <div className="space-y-4">
      <Block title="Заголовок" text={card.title}>
        <p>{card.title}</p>
        <p className="mt-2 text-xs text-muted">{card.title.length} символов</p>
      </Block>

      <Block title="Буллеты" text={card.bullets.map((b) => `• ${b}`).join("\n")}>
        <ul className="list-disc space-y-1 pl-5">
          {card.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </Block>

      <Block title="Описание" text={card.description}>
        <p className="whitespace-pre-wrap">{card.description}</p>
        <p className="mt-2 text-xs text-muted">{card.description.length} символов</p>
      </Block>

      <Block title="Ключевые слова" text={card.keywords.join(", ")}>
        <p className="text-muted">{card.keywords.join(", ")}</p>
      </Block>

      <Block title="Поисковые запросы" text={card.search_queries.join("\n")}>
        <ul className="space-y-1 text-muted">
          {card.search_queries.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

function Block({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-brand hover:text-brand"
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      {children}
    </section>
  );
}
