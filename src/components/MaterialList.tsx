import { MaterialTag } from "@/components/MaterialTag";

// Разбивает строку вида "PLA, PETG, ABS" на отдельные подсказки-чипы.
// Значения, не входящие в справочник материалов (напр. форматы файлов у
// дизайнеров — "STL, STEP, OBJ"), отображаются как обычный текст без тултипа.
export function MaterialList({ value, className = "" }: { value: string; className?: string }) {
  const items = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  return (
    <span className={`inline-flex flex-wrap gap-x-1.5 gap-y-1 ${className}`}>
      {items.map((item, i) => (
        <span key={`${item}-${i}`}>
          <MaterialTag material={item} />
          {i < items.length - 1 && ","}
        </span>
      ))}
    </span>
  );
}
