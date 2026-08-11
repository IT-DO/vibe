import { LocaleLink as Link } from "@/components/LocaleLink";
import { getSpecialists } from "@/lib/users";
import { RatingStars } from "@/components/RatingStars";
import { AchievementBadge } from "@/components/AchievementBadge";
import { MaterialList } from "@/components/MaterialList";
import { MATERIALS, PROFILE_FIELD_LABELS, type Role } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await getLocale(), "executors", "/executors");
}


function isBidderRole(value: string | undefined): value is "EXECUTOR" | "DESIGNER" {
  return value === "EXECUTOR" || value === "DESIGNER";
}

function isSortBy(value: string | undefined): value is "rating" | "reviews" | "completedOrders" {
  return value === "rating" || value === "reviews" || value === "completedOrders";
}

const RATING_OPTIONS = [4.5, 4, 3.5];
const COMPLETED_OPTIONS = [5, 10, 20];
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

  const dict = await getDictionary();
  const t = dict.executors;
  const SORT_LABELS: Record<"rating" | "reviews" | "completedOrders", string> = {
    rating: t.sortByRating,
    reviews: t.sortByReviews,
    completedOrders: t.sortByOrders,
  };

  const hasActiveFilters = Boolean(
    params.role || params.material || params.city || params.minRating || params.minCompleted
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {specialists.length} {t.specialists}{" "}
            {hasActiveFilters ? t.byFilters : t.onPlatform}
          </p>
        </div>
      </div>

      <form className="card mb-8 p-4" method="get">
        <div className="flex flex-wrap gap-3">
          <select name="role" defaultValue={params.role ?? ""} className="input max-w-xs">
            <option value="">{t.allRoles}</option>
            <option value="EXECUTOR">{dict.roles.EXECUTOR}</option>
            <option value="DESIGNER">{dict.roles.DESIGNER}</option>
          </select>
          <select name="material" defaultValue={params.material ?? ""} className="input max-w-xs">
            <option value="">{dict.auctions.anyMaterial}</option>
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input name="city" defaultValue={params.city} placeholder={t.city} className="input max-w-xs" />
          <select name="minRating" defaultValue={params.minRating ?? ""} className="input max-w-xs">
            <option value="">{t.anyRating}</option>
            {RATING_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {t.from} {r.toFixed(1)} ★
              </option>
            ))}
          </select>
          <select name="minCompleted" defaultValue={params.minCompleted ?? ""} className="input max-w-xs">
            <option value="">{t.anyOrders}</option>
            {COMPLETED_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {t.from} {c} {t.completedOrders}
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
            {t.find}
          </button>
          {hasActiveFilters && (
            <Link href="/executors" className="btn-secondary">
              {t.reset}
            </Link>
          )}
        </div>
      </form>

      {specialists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          {t.nobodyFound}
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
                      {dict.roles[person.role as Role]}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RatingStars rating={person.ratingAvg} count={person.ratingCount} size="sm" />
                  <AchievementBadge reviewCount={person.ratingCount} />
                </div>
                <p className="mt-2 text-xs text-slate-400">{person.completedOrders} {t.completedOrders}</p>
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
                    {t.from} {formatMoney(person.pricePerGram)} {person.role === "DESIGNER" ? dict.achievements.perHour : dict.achievements.perGram}
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
