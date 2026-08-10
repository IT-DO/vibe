import Link from "next/link";
import { getSpecialists } from "@/lib/users";
import { RatingStars } from "@/components/RatingStars";
import { AchievementBadge } from "@/components/AchievementBadge";
import { MaterialList } from "@/components/MaterialList";
import { MATERIALS, ROLE_LABELS, PROFILE_FIELD_LABELS, type Role } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

function isBidderRole(value: string | undefined): value is "EXECUTOR" | "DESIGNER" {
  return value === "EXECUTOR" || value === "DESIGNER";
}

function isSortBy(value: string | undefined): value is "rating" | "reviews" | "completedOrders" {
  return value === "rating" || value === "reviews" || value === "completedOrders";
}

const RATING_OPTIONS = [4.5, 4, 3.5];
const COMPLETED_OPTIONS = [5, 10, 20];
const SORT_LABELS: Record<"rating" | "reviews" | "completedOrders", string> = {
  rating: "По рейтингу",
  reviews: "По количеству отзывов",
  completedOrders: "По количеству заказов",
};

export default async function ExecutorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    material?: string;
    city?: string;
    role?: string;
    minRating?: string;
    minCompleted?: string;
    sortBy?: string;
  }>;
}) {
  const params = await searchParams;
  const roleFilter = isBidderRole(params.role) ? (params.role as Role) : undefined;
  const sortBy = isSortBy(params.sortBy) ? params.sortBy : "rating";
  const minRating = params.minRating ? Number(params.minRating) : undefined;
  const minCompleted = params.minCompleted ? Number(params.minCompleted) : undefined;

  const specialists = await getSpecialists({
    role: roleFilter,
    material: params.material,
    city: params.city,
    minRating,
    minCompletedOrders: minCompleted,
    sortBy,
  });

  const hasActiveFilters = Boolean(
    params.role || params.material || params.city || params.minRating || params.minCompleted
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Исполнители и дизайнеры</h1>
          <p className="mt-1 text-sm text-slate-500">
            {specialists.length}{" "}
            {specialists.length === 1 ? "специалист" : specialists.length < 5 ? "специалиста" : "специалистов"}
            {hasActiveFilters ? " по вашим фильтрам" : " на площадке"}
          </p>
        </div>
      </div>

      <form className="card mb-8 p-4" method="get">
        <div className="flex flex-wrap gap-3">
          <select name="role" defaultValue={params.role ?? ""} className="input max-w-xs">
            <option value="">Все роли</option>
            <option value="EXECUTOR">{ROLE_LABELS.EXECUTOR}</option>
            <option value="DESIGNER">{ROLE_LABELS.DESIGNER}</option>
          </select>
          <select name="material" defaultValue={params.material ?? ""} className="input max-w-xs">
            <option value="">Любой материал</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input name="city" defaultValue={params.city} placeholder="Город" className="input max-w-xs" />
          <select name="minRating" defaultValue={params.minRating ?? ""} className="input max-w-xs">
            <option value="">Любой рейтинг</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                От {r.toFixed(1)} ★
              </option>
            ))}
          </select>
          <select name="minCompleted" defaultValue={params.minCompleted ?? ""} className="input max-w-xs">
            <option value="">Любое число заказов</option>
            {COMPLETED_OPTIONS.map((c) => (
              <option key={c} value={c}>
                От {c} выполненных заказов
              </option>
            ))}
          </select>
          <select name="sortBy" defaultValue={sortBy} className="input max-w-xs">
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-primary">
            Найти
          </button>
          {hasActiveFilters && (
            <Link href="/executors" className="btn-secondary">
              Сбросить
            </Link>
          )}
        </div>
      </form>

      {specialists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Никого не нашлось по этим фильтрам. Попробуйте ослабить условия.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialists.map((person) => {
            const labels = PROFILE_FIELD_LABELS[person.role === "DESIGNER" ? "DESIGNER" : "EXECUTOR"];
            const initial = person.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <Link key={person.id} href={`/u/${person.id}`} className="card-hover group flex flex-col">
                <div className="mb-2 flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 font-bold text-orange-700">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-semibold text-slate-900 group-hover:text-orange-700">
                        {person.name}
                      </h3>
                      {person.city && <span className="shrink-0 text-xs text-slate-400">{person.city}</span>}
                    </div>
                    <span className="mt-0.5 inline-block w-fit rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {ROLE_LABELS[person.role as Role]}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars rating={person.ratingAvg} count={person.ratingCount} size="sm" />
                  <AchievementBadge reviewCount={person.ratingCount} />
                </div>
                <p className="mt-2 text-xs text-slate-400">{person.completedOrders} выполненных заказов</p>
                {person.specialization && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{person.specialization}</p>
                )}
                {person.materials && (
                  <p className="mt-2 text-xs text-slate-400">
                    {labels.materials}: <MaterialList value={person.materials} />
                  </p>
                )}
                {person.pricePerGram && (
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    От {formatMoney(person.pricePerGram)} {person.role === "DESIGNER" ? "/ час" : "/ г"}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
