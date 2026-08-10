import { MATERIALS, MATERIAL_PROPERTIES } from "@/lib/constants";

// Разворачиваемая справка по материалам — для страниц с select-фильтром
// по материалу, где обычный ховер-тултип на <option> не работает нативно.
export function MaterialsLegend({ className = "" }: { className?: string }) {
  return (
    <details className={`group text-sm ${className}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-slate-500 hover:text-slate-700">
        <span className="text-orange-500">ⓘ</span> Какой материал выбрать?
      </summary>
      <dl className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        {MATERIALS.map((m) => (
          <div key={m}>
            <dt className="font-semibold text-slate-800">{m}</dt>
            <dd className="mt-0.5 text-xs leading-snug text-slate-500">{MATERIAL_PROPERTIES[m]}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
