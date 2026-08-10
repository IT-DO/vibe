import Link from "next/link";
import { getExecutors } from "@/lib/users";
import { RatingStars } from "@/components/RatingStars";
import { MATERIALS } from "@/lib/constants";
import { formatMoney } from "@/lib/format";

export default async function ExecutorsPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string; city?: string }>;
}) {
  const params = await searchParams;
  const executors = await getExecutors({ material: params.material, city: params.city });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Исполнители</h1>

      <form className="mb-8 flex flex-wrap gap-3" method="get">
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

      {executors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          Никого не нашлось по этим фильтрам.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {executors.map((exec) => (
            <Link
              key={exec.id}
              href={`/u/${exec.id}`}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-orange-300 hover:shadow-md"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{exec.name}</h3>
                {exec.city && <span className="text-xs text-slate-400">{exec.city}</span>}
              </div>
              <RatingStars rating={exec.ratingAvg} count={exec.ratingCount} size="sm" />
              {exec.specialization && (
                <p className="mt-2 line-clamp-2 text-sm text-slate-500">{exec.specialization}</p>
              )}
              {exec.materials && (
                <p className="mt-2 text-xs text-slate-400">Материалы: {exec.materials}</p>
              )}
              {exec.pricePerGram && (
                <p className="mt-1 text-xs text-slate-400">
                  От {formatMoney(exec.pricePerGram)} / г
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
