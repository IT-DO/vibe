import { MATERIAL_PROPERTIES, MATERIAL_SPECS } from "@/lib/constants";

// Чистый CSS-тултип (без JS) — при наведении/фокусе показывает типовые
// потребительские свойства материала плюс усреднённые справочные цифры.
// Работает и в серверных компонентах. Полная таблица характеристик — /materials.
export function MaterialTag({ material, className = "" }: { material: string; className?: string }) {
  const description = MATERIAL_PROPERTIES[material];
  const spec = MATERIAL_SPECS[material];

  if (!description) {
    return <span className={className}>{material}</span>;
  }

  return (
    // Именованная группа (group/material) — принципиально важно: карточки,
    // на которых стоит этот тег (карточки заказов/специалистов), сами имеют
    // класс "group" для своего hover-эффекта. Безымянный group-hover ловит
    // hover ЛЮБОГО предка с классом .group, а не только ближайшего — из-за
    // этого при наведении на всю карточку разом всплывали ВСЕ подсказки
    // внутри неё. Именованная группа скоупит hover строго к этому span.
    <span
      className={`group/material relative inline-flex cursor-help items-center gap-1 border-b border-dotted border-slate-400 ${className}`}
    >
      {material}
      <span className="text-[10px] text-slate-400">ⓘ</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition duration-150 group-hover/material:opacity-100">
        {description}
        {spec && (
          <span className="mt-1.5 block border-t border-slate-700 pt-1.5 text-[11px] text-slate-300">
            {spec.processTemp} · термостойкость {spec.heatResistance}
          </span>
        )}
        <span className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}
