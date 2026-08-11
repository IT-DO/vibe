import { LocaleLink as Link } from "@/components/LocaleLink";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getOrderById } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { formatMoney, formatDate, formatRelative, biddingIsOpen } from "@/lib/format";
import { OrderStatusBadge, BidStatusBadge } from "@/components/StatusBadge";
import { RatingStars } from "@/components/RatingStars";
import { BIDDER_ROLES, type OrderStatus, type BidStatus } from "@/lib/constants";
import { MaterialTag } from "@/components/MaterialTag";
import { BidForm } from "./BidForm";
import { AcceptBidButton, LifecycleButtons } from "./ActionButtons";
import { ReviewSection } from "./ReviewSection";
import { AttachmentsSection } from "./AttachmentsSection";


import type { Metadata } from "next";
import { buildMetadata, SEO } from "@/lib/seo";
import { getLocale } from "@/lib/i18n";

// Заголовок и описание берём из самого заказа — именно такие страницы
// собирают длинный хвост поисковых запросов ("печать шестерни из нейлона").
// Закрытые/отменённые заказы из индекса убираем: они уже неактуальны.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const order = await getOrderById(id);
  if (!order) return buildMetadata({ locale, path: `/auctions/${id}`, title: "PrintAu", description: "", noindex: true });

  const budget = order.budgetMin && order.budgetMax ? ` ${order.budgetMin}–${order.budgetMax}` : "";
  return buildMetadata({
    locale,
    path: `/auctions/${order.id}`,
    title: `${order.title} — ${order.material} | PrintAu`,
    description: order.description.replace(/\s+/g, " ").slice(0, 155) || `${order.title}${budget}`,
    keywords: SEO[locale].keywords,
    noindex: order.status === "CANCELLED" || order.status === "COMPLETED",
  });
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, session] = await Promise.all([getOrderById(id), auth()]);

  if (!order) notFound();

  const status = order.status as OrderStatus;
  const isOwner = session?.user?.id === order.customerId;
  const canBid = Boolean(
    session?.user && BIDDER_ROLES.includes(session.user.role as (typeof BIDDER_ROLES)[number])
  );
  const open = status === "OPEN" && biddingIsOpen(order.biddingEnds);
  const myBid = canBid ? order.bids.find((b) => b.executorId === session!.user.id) : undefined;

  const winningBid = order.bids.find((b) => b.status === "ACCEPTED");
  const canUploadAttachment = Boolean(
    session?.user &&
      status !== "CANCELLED" &&
      (isOwner || session.user.id === winningBid?.executorId)
  );
  const isWinningExecutor = Boolean(session?.user && winningBid && session.user.id === winningBid.executorId);
  const hasPhotoAttachment = order.attachments.some((a) => a.mimeType.startsWith("image/"));
  const promptForPhoto = status === "COMPLETED" && isWinningExecutor && !hasPhotoAttachment;
  let reviewParticipant: { canReview: boolean; alreadyReviewed: boolean; targetId?: string } = {
    canReview: false,
    alreadyReviewed: false,
  };

  if (status === "COMPLETED" && session?.user && winningBid) {
    const userId = session.user.id;
    const isParticipant = userId === order.customerId || userId === winningBid.executorId;
    if (isParticipant) {
      const targetId = userId === order.customerId ? winningBid.executorId : order.customerId;
      const existing = await prisma.review.findUnique({
        where: { orderId_authorId: { orderId: order.id, authorId: userId } },
      });
      reviewParticipant = { canReview: true, alreadyReviewed: Boolean(existing), targetId };
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{order.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Заказчик:{" "}
            <Link href={`/u/${order.customer.id}`} className="font-medium text-slate-700 hover:underline">
              {order.customer.name}
            </Link>{" "}
            {order.customer.city && <>· {order.customer.city}</>}
          </p>
        </div>
        <OrderStatusBadge status={status} />
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        <div className="sm:col-span-2 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-2 font-semibold text-slate-900">Описание</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{order.description}</p>
          </div>

          {/* Список файлов отдаём только авторизованным — анонимным посетителям
              страница ничего не сообщает даже о факте наличия вложений
              (см. /privacy). Скачивание отдельных файлов дополнительно
              проверяется на сервере в src/app/api/attachments/[id]/route.ts. */}
          <AttachmentsSection
            orderId={order.id}
            attachments={session?.user ? order.attachments : []}
            currentUserId={session?.user?.id}
            canUpload={canUploadAttachment}
            promptForPhoto={promptForPhoto}
          />

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 font-semibold text-slate-900">
              Ставки исполнителей ({order.bids.length})
            </h2>
            {order.bids.length === 0 ? (
              <p className="text-sm text-slate-400">Пока никто не сделал ставку.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {order.bids.map((bid) => (
                  <li key={bid.id} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/u/${bid.executor.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          {bid.executor.name}
                        </Link>
                        <BidStatusBadge status={bid.status as BidStatus} />
                      </div>
                      <div className="mt-0.5">
                        <RatingStars rating={bid.executor.ratingAvg} count={bid.executor.ratingCount} size="sm" />
                      </div>
                      {bid.message && <p className="mt-1 text-sm text-slate-500">{bid.message}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-slate-900">{formatMoney(bid.price)}</p>
                      <p className="text-xs text-slate-400">{bid.leadTimeDays} дн.</p>
                      {isOwner && status === "OPEN" && bid.status === "PENDING" && (
                        <AcceptBidButton bidId={bid.id} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {status === "COMPLETED" && (
            <ReviewSection order={order} reviewParticipant={reviewParticipant} />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
            <dl className="space-y-2">
              <div className="flex justify-between">
                <dt className="text-slate-500">Материал</dt>
                <dd className="font-medium text-slate-900">
                  <MaterialTag material={order.material} />
                </dd>
              </div>
              {order.color && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Цвет</dt>
                  <dd className="font-medium text-slate-900">{order.color}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Количество</dt>
                <dd className="font-medium text-slate-900">{order.quantity} шт.</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Бюджет</dt>
                <dd className="font-medium text-slate-900">
                  {formatMoney(order.budgetMin)}–{formatMoney(order.budgetMax)}
                </dd>
              </div>
              {order.deadline && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Срок готовности</dt>
                  <dd className="font-medium text-slate-900">{formatDate(order.deadline)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Приём ставок</dt>
                <dd className="font-medium text-slate-900">
                  {open ? formatRelative(order.biddingEnds) : "завершён"}
                </dd>
              </div>
            </dl>
          </div>

          {isOwner && <LifecycleButtons orderId={order.id} status={status} />}

          {open && canBid && !isOwner && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="mb-3 font-semibold text-slate-900">
                {myBid ? "Изменить вашу ставку" : "Сделать ставку"}
              </h2>
              <BidForm orderId={order.id} initial={myBid} />
            </div>
          )}

          {open && !session?.user && (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">
              <Link href="/login" className="font-medium text-orange-600 hover:underline">
                Войдите
              </Link>{" "}
              как исполнитель или дизайнер, чтобы сделать ставку.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
