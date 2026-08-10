export function RatingStars({
  rating,
  count,
  size = "md",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "md";
}) {
  const rounded = Math.round(rating);
  const starClass = size === "sm" ? "text-sm" : "text-base";

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`${starClass} tracking-tight text-amber-500`} aria-hidden>
        {"★".repeat(rounded)}
        <span className="text-slate-300">{"★".repeat(5 - rounded)}</span>
      </span>
      <span className="text-sm text-slate-600">
        {rating > 0 ? rating.toFixed(1) : "—"}
        {typeof count === "number" && (
          <span className="text-slate-400"> ({count})</span>
        )}
      </span>
    </span>
  );
}
