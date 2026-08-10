"use client";

import { useRef, useState, useEffect } from "react";
import { setLocaleAction } from "@/lib/actions/locale";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";

export function LanguageSwitcher({ current, label }: { current: Locale; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
            <form key={locale} action={setLocaleAction}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition hover:bg-slate-50 ${
                  locale === current ? "font-semibold text-orange-700" : "text-slate-700"
                }`}
              >
                <span aria-hidden>{LOCALE_META[locale].flag}</span>
                {LOCALE_META[locale].label}
                {locale === current && <span className="ms-auto text-xs text-orange-600">✓</span>}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
