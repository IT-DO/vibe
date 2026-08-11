import { REVIEW_ACHIEVEMENTS } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

// Порог ачивки берём из констант, а подпись — из словаря локали, поэтому
// сам список порогов остаётся единственным источником правды.
export async function AchievementBadge({ reviewCount, className = "" }: { reviewCount: number; className?: string }) {
  const t = await getDictionary();
  const LABELS = [t.achievements.top, t.achievements.experienced, t.achievements.verified];

  const index = REVIEW_ACHIEVEMENTS.findIndex((tier) => reviewCount >= tier.min);
  if (index === -1) return null;
  const tier = REVIEW_ACHIEVEMENTS[index];

  return (
    <span
      title={`${LABELS[index]}: ${reviewCount}+`}
      className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 ${className}`}
    >
      <span aria-hidden>{tier.emoji}</span>
      {LABELS[index]}
    </span>
  );
}
