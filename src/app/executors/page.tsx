import Link from "next/link";
import { getSpecialists } from "@/lib/users";
import { RatingStars } from "@/components/RatingStars";
import { MATERIALS, ROLE_LABELS, PROFILE_FIELD_LABELS, type Role } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

function isBidderRole(value: string | undefined): value is "EXECUTOR" | "DESIGNER" {
  return value === "EXECUTOR" || value === "DESIGNER";
}

export default async function ExecutorsPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; city?: string; role?: string }>;
}) {
  const params = await searchParams;
  const roleFilter = isBidderRole(params.role) ? (params.role as Role) : undefined;
  const specialists = await getSpecialists({
    role: roleFilter,
    material: params.material,
    city: params.city,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Исполнители и дизайнеры</h1>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
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
        <input
          name="city"
          defaultValue={params.city}
          placeholder="Город"
          className="input max-w-xs"
        />
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Найти
        </button>
      </form>

      {specialists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Никого не нашлось по этим фильтрам.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {specialists.map((person) => {
            const labels = PROFILE_FIELD_LABELS[person.role === "DESIGNER" ? "DESIGNER" : "EXECUTOR"];
            const initial = person.name.trim().charAt(0).toUpperCase() || "?";
            return (
              <Link
                key={person.id}
                href={`/u/${person.id}`}
                className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
              >
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
                <RatingStars rating={person.ratingAvg} count={person.ratingCount} size="sm" />
                {person.specialization && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-500">{person.specialization}</p>
                )}
                {person.materials && (
                  <p className="mt-2 text-xs text-slate-400">
                    {labels.materials}: {person.materials}
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
