"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { setLocaleAction } from "@/lib/actions/locale";
import { LOCALES, LOCALE_META, localePath, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Язык живёт в адресе, поэтому переключение — это переход на ту же страницу
  // под другим префиксом (/en/auctions → /fr/auctions), а не только запись
  // куки. Куку всё равно обновляем: по ней потом происходит редирект с корня.
  // Экшен вызываем напрямую в transition, а не через <form> с onClick,
  // закрывающим меню: закрытие размонтировало бы форму раньше отправки
  // ("Form submission canceled because the form is not connected").
  function choose(locale: Locale) {
    if (locale === current) {
      setOpen(false);
      return;
    }
    const query = searchParams.toString();
    const target = localePath(pathname, locale) + (query ? `?${query}` : "");
    const formData = new FormData();
    formData.set("locale", locale);
    startTransition(async () => {
      await setLocaleAction(formData);
      router.push(target);
      router.refresh();
      setOpen(false);
    });
  }

  // Закрываем выпадающий список по клику вне его и по Escape — иначе он
  // остаётся висеть поверх страницы после перехода фокуса.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        <span aria-hidden>{LOCALE_META[current].flag}</span>
        <span className="hidden sm:inline">{LOCALE_META[current].label}</span>
        <span aria-hidden className="text-xs text-slate-400">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 z-40 mt-2 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              role="menuitem"
              lang={locale}
              disabled={pending}
              onClick={() => choose(locale)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition hover:bg-slate-50 disabled:opacity-60 ${
                locale === current ? "font-semibold text-orange-700" : "text-slate-700"
              }`}
            >
              <span aria-hidden>{LOCALE_META[locale].flag}</span>
              {LOCALE_META[locale].label}
              {locale === current && <span className="ms-auto text-xs text-orange-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
