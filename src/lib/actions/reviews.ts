"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { recalculateRating } from "@/lib/users";
import { sendMailSafe, sanitizeHeaderValue } from "@/lib/mail";
import { getAppOrigin } from "@/lib/origin";
import type { ActionState } from "@/lib/actions/auth";

const reviewSchema = z.object({
  orderId: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function leaveReviewAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const parsed = reviewSchema.safeParse({
    orderId: formData.get("orderId"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { orderId, rating, comment } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { bids: { where: { status: "ACCEPTED" } } },
  });
  if (!order) return { error: "Заказ не найден" };
  if (order.status !== "COMPLETED") {
    return { error: "Отзыв можно оставить только после завершения заказа" };
  }

  const winningExecutorId = order.bids[0]?.executorId;
  const userId = session.user.id;

  let targetId: string;
  if (userId === order.customerId) {
    if (!winningExecutorId) return { error: "У заказа нет исполнителя" };
    targetId = winningExecutorId;
  } else if (userId === winningExecutorId) {
    targetId = order.customerId;
  } else {
    return { error: "Вы не участвовали в этом заказе" };
  }

  const existing = await prisma.review.findUnique({
    where: { orderId_authorId: { orderId, authorId: userId } },
  });
  if (existing) return { error: "Вы уже оставили отзыв по этому заказу" };

  await prisma.review.create({
    data: { orderId, authorId: userId, targetId, rating, comment: comment || null },
  });

  await recalculateRating(targetId);

  const [target, author] = await Promise.all([
    prisma.user.findUnique({ where: { id: targetId }, select: { email: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ]);
  if (target) {
    const origin = await getAppOrigin();
    await sendMailSafe({
      to: target.email,
      subject: `Новый отзыв от ${sanitizeHeaderValue(author?.name ?? "пользователя")}`,
      text: `Вам поставили оценку ${rating}/5${comment ? `: «${comment}»` : ""}.\n\nПосмотреть профиль: ${origin}/u/${targetId}`,
    });
  }

  revalidatePath(`/auctions/${orderId}`);
  revalidatePath(`/u/${targetId}`);
  return {};
}
