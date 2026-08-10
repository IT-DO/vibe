"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { ActionState } from "@/lib/actions/auth";
import { BIDDER_ROLES } from "@/lib/constants";
import { filesFromFormData, validateFiles, saveAttachments } from "@/lib/storage";

const createOrderSchema = z
  .object({
    title: z.string().trim().min(5, "Минимум 5 символов").max(150),
    description: z.string().trim().min(10, "Опишите заказ подробнее (минимум 10 символов)").max(4000),
    material: z.string().trim().min(1, "Укажите материал").max(60),
    color: z.string().trim().max(60).optional().or(z.literal("")),
    quantity: z.coerce.number().int().min(1).max(100000),
    budgetMin: z.coerce.number().int().min(0).optional(),
    budgetMax: z.coerce.number().int().min(0).optional(),
    biddingDays: z.coerce.number().int().min(1).max(30),
    deadlineDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .refine(
    (data) => !data.budgetMin || !data.budgetMax || data.budgetMax >= data.budgetMin,
    { message: "Максимальный бюджет не может быть меньше минимального", path: ["budgetMax"] }
  );

export async function createOrderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "CUSTOMER") {
    return { error: "Только заказчики могут размещать заказы" };
  }

  const parsed = createOrderSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    material: formData.get("material"),
    color: formData.get("color"),
    quantity: formData.get("quantity"),
    budgetMin: formData.get("budgetMin") || undefined,
    budgetMax: formData.get("budgetMax") || undefined,
    biddingDays: formData.get("biddingDays"),
    deadlineDays: formData.get("deadlineDays") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const files = filesFromFormData(formData);
  const filesError = validateFiles(files);
  if (filesError) return { error: filesError };

  const { title, description, material, color, quantity, budgetMin, budgetMax, biddingDays, deadlineDays } =
    parsed.data;

  const now = Date.now();
  const order = await prisma.order.create({
    data: {
      customerId: session.user.id,
      title,
      description,
      material,
      color: color || null,
      quantity,
      budgetMin: budgetMin ?? null,
      budgetMax: budgetMax ?? null,
      biddingEnds: new Date(now + biddingDays * 24 * 60 * 60 * 1000),
      deadline: deadlineDays ? new Date(now + deadlineDays * 24 * 60 * 60 * 1000) : null,
    },
  });

  if (files.length > 0) {
    await saveAttachments(order.id, session.user.id, files);
  }

  revalidatePath("/auctions");
  redirect(`/auctions/${order.id}`);
}

const bidSchema = z.object({
  orderId: z.string().min(1),
  price: z.coerce.number().int().min(1, "Укажите цену").max(10_000_000),
  leadTimeDays: z.coerce.number().int().min(1, "Укажите срок").max(365),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function placeBidAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || !BIDDER_ROLES.includes(session.user.role as (typeof BIDDER_ROLES)[number])) {
    return { error: "Только исполнители и дизайнеры могут делать ставки" };
  }

  const parsed = bidSchema.safeParse({
    orderId: formData.get("orderId"),
    price: formData.get("price"),
    leadTimeDays: formData.get("leadTimeDays"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { orderId, price, leadTimeDays, message } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Заказ не найден" };
  if (order.customerId === session.user.id) {
    return { error: "Нельзя делать ставку на собственный заказ" };
  }
  if (order.status !== "OPEN" || order.biddingEnds.getTime() < Date.now()) {
    return { error: "Приём ставок по этому заказу завершён" };
  }

  await prisma.bid.upsert({
    where: { orderId_executorId: { orderId, executorId: session.user.id } },
    update: { price, leadTimeDays, message: message || null, status: "PENDING" },
    create: {
      orderId,
      executorId: session.user.id,
      price,
      leadTimeDays,
      message: message || null,
    },
  });

  revalidatePath(`/auctions/${orderId}`);
  return {};
}

export async function acceptBidAction(bidId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const bid = await prisma.bid.findUnique({ where: { id: bidId }, include: { order: true } });
  if (!bid) return { error: "Ставка не найдена" };
  if (bid.order.customerId !== session.user.id) {
    return { error: "Недостаточно прав" };
  }
  if (bid.order.status !== "OPEN") {
    return { error: "Исполнитель для этого заказа уже выбран" };
  }

  await prisma.$transaction([
    prisma.bid.update({ where: { id: bidId }, data: { status: "ACCEPTED" } }),
    prisma.bid.updateMany({
      where: { orderId: bid.orderId, id: { not: bidId } },
      data: { status: "REJECTED" },
    }),
    prisma.order.update({
      where: { id: bid.orderId },
      data: { status: "AWARDED", winningBidId: bidId },
    }),
  ]);

  revalidatePath(`/auctions/${bid.orderId}`);
  revalidatePath("/dashboard");
  return {};
}

async function transitionOrder(
  orderId: string,
  allowedCurrent: string[],
  next: string,
  checkPermission: (order: { customerId: string }, userId: string, role: string) => boolean
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Заказ не найден" };
  if (!checkPermission(order, session.user.id, session.user.role)) {
    return { error: "Недостаточно прав" };
  }
  if (!allowedCurrent.includes(order.status)) {
    return { error: "Недопустимый переход статуса" };
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: next } });
  revalidatePath(`/auctions/${orderId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function startProgressAction(orderId: string): Promise<ActionState> {
  return transitionOrder(orderId, ["AWARDED"], "IN_PROGRESS", (order, userId) => order.customerId === userId);
}

export async function completeOrderAction(orderId: string): Promise<ActionState> {
  return transitionOrder(
    orderId,
    ["AWARDED", "IN_PROGRESS"],
    "COMPLETED",
    (order, userId) => order.customerId === userId
  );
}

export async function cancelOrderAction(orderId: string): Promise<ActionState> {
  return transitionOrder(orderId, ["OPEN", "AWARDED"], "CANCELLED", (order, userId) => order.customerId === userId);
}
