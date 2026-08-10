import { getReviewAchievement } from "@/lib/constants";

export function AchievementBadge({ reviewCount, className = "" }: { reviewCount: number; className?: string }) {
  const achievement = getReviewAchievement(reviewCount);
  if (!achievement) return null;

  return (
    <span
      title={`${achievement.label}: ${reviewCount}+ отзывов`}
      className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 ${className}`}
    >
      <span aria-hidden>{achievement.emoji}</span>
      {achievement.label}
    </span>
  );
}
