import { MATERIAL_PROPERTIES } from "@/lib/constants";

// Чистый CSS-тултип (без JS) — при наведении/фокусе показывает типовые
// потребительские свойства материала. Работает и в серверных компонентах.
export function MaterialTag({ material, className = "" }: { material: string; className?: string }) {
  const description = MATERIAL_PROPERTIES[material];

  if (!description) {
    return <span className={className}>{material}</span>;
  }

  return (
    <span
      className={`group relative inline-flex cursor-help items-center gap-1 border-b border-dotted border-slate-400 ${className}`}
    >
      {material}
      <span className="text-[10px] text-slate-400">ⓘ</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition duration-150 group-hover:opacity-100">
        {description}
        <span className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}
