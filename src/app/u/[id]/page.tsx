import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { getUserProfile } from "@/lib/users";
import { RatingStars } from "@/components/RatingStars";
import { AchievementBadge } from "@/components/AchievementBadge";
import { MaterialList } from "@/components/MaterialList";
import { ROLE_LABELS, PROFILE_FIELD_LABELS, type Role } from "@/lib/constants";
import { formatDate, formatMoney } from "@/lib/format";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, session] = await Promise.all([getUserProfile(id), auth()]);

  if (!user) notFound();

  const isSelf = session?.user?.id === user.id;
  const role = user.role as Role;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {ROLE_LABELS[role]}
              </span>
            </div>
            {user.city && <p className="mt-0.5 text-sm text-slate-500">{user.city}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RatingStars rating={user.ratingAvg} count={user.ratingCount} />
              <AchievementBadge reviewCount={user.ratingCount} />
            </div>
          </div>
          {isSelf && (
            <Link
              href="/profile/edit"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Редактировать профиль
            </Link>
          )}
        </div>

        {user.bio && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{user.bio}</p>}

        {(role === "EXECUTOR" || role === "DESIGNER") && (
          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 text-sm sm:grid-cols-3">
            {user.specialization && (
              <div>
                <dt className="text-slate-400">{PROFILE_FIELD_LABELS[role].specialization}</dt>
                <dd className="font-medium text-slate-900">{user.specialization}</dd>
              </div>
            )}
            {user.materials && (
              <div>
                <dt className="text-slate-400">{PROFILE_FIELD_LABELS[role].materials}</dt>
                <dd className="font-medium text-slate-900">
                  <MaterialList value={user.materials} />
                </dd>
              </div>
            )}
            {user.printer && (
              <div>
                <dt className="text-slate-400">{PROFILE_FIELD_LABELS[role].printer}</dt>
                <dd className="font-medium text-slate-900">{user.printer}</dd>
              </div>
            )}
            {user.pricePerGram && (
              <div>
                <dt className="text-slate-400">{PROFILE_FIELD_LABELS[role].price}</dt>
                <dd className="font-medium text-slate-900">{formatMoney(user.pricePerGram)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-bold text-slate-900">
          Отзывы ({user.reviewsReceived.length})
        </h2>
        {user.reviewsReceived.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Пока нет отзывов.
          </p>
        ) : (
          <ul className="space-y-4">
            {user.reviewsReceived.map((review) => (
              <li key={review.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{review.author.name}</span>
                    <span className="text-xs text-slate-400">
                      ({ROLE_LABELS[review.author.role as Role]})
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">{formatDate(review.createdAt)}</span>
                </div>
                <div className="mt-1">
                  <RatingStars rating={review.rating} size="sm" />
                </div>
                {review.comment && <p className="mt-1 text-sm text-slate-600">{review.comment}</p>}
                <Link
                  href={`/auctions/${review.order.id}`}
                  className="mt-1 inline-block text-xs text-orange-600 hover:underline"
                >
                  По заказу «{review.order.title}»
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
