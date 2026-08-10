import { RatingStars } from "@/components/RatingStars";
import type { getOrderById } from "@/lib/orders";
import { ReviewForm } from "./ReviewForm";

type Order = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;

export function ReviewSection({
  order,
  reviewParticipant,
}: {
  order: Order;
  reviewParticipant: { canReview: boolean; alreadyReviewed: boolean; targetId?: string };
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 font-semibold text-slate-900">Отзывы по заказу</h2>

      {order.reviews.length === 0 ? (
        <p className="text-sm text-slate-400">Отзывов пока нет.</p>
      ) : (
        <ul className="space-y-4">
          {order.reviews.map((review) => (
            <li key={review.id} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
              <RatingStars rating={review.rating} size="sm" />
              {review.comment && <p className="mt-1 text-sm text-slate-600">{review.comment}</p>}
            </li>
          ))}
        </ul>
      )}

      {reviewParticipant.canReview && !reviewParticipant.alreadyReviewed && (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Оставить отзыв</h3>
          <ReviewForm orderId={order.id} />
        </div>
      )}
    </div>
  );
}
