"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  filesFromFormData,
  validateFiles,
  saveAttachments,
  deleteStoredFile,
  MAX_ATTACHMENTS_PER_ORDER,
} from "@/lib/storage";
import type { ActionState } from "@/lib/actions/auth";

// Кто может прикладывать файлы к конкретному заказу: сам заказчик (пока заказ не
// отменён) или выбранный исполнитель/дизайнер после того, как его ставку приняли.
async function assertCanAttach(orderId: string, userId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { bids: { where: { status: "ACCEPTED" }, select: { executorId: true } } },
  });
  if (!order) return { error: "Заказ не найден" } as const;
  if (order.status === "CANCELLED") return { error: "Заказ отменён" } as const;

  const winningExecutorId = order.bids[0]?.executorId;
  const isOwner = userId === order.customerId;
  const isWinner = userId === winningExecutorId;
  if (!isOwner && !isWinner) return { error: "У вас нет доступа к этому заказу" } as const;

  return { order } as const;
}

export async function uploadAttachmentAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId) return { error: "Некорректный заказ" };

  const access = await assertCanAttach(orderId, session.user.id);
  if ("error" in access) return { error: access.error };

  const files = filesFromFormData(formData);
  const validationError = validateFiles(files);
  if (validationError) return { error: validationError };
  if (files.length === 0) return { error: "Выберите хотя бы один файл" };

  const existingCount = await prisma.attachment.count({ where: { orderId } });
  if (existingCount + files.length > MAX_ATTACHMENTS_PER_ORDER) {
    return { error: `У заказа не может быть больше ${MAX_ATTACHMENTS_PER_ORDER} файлов` };
  }

  await saveAttachments(orderId, session.user.id, files);

  revalidatePath(`/auctions/${orderId}`);
  return {};
}

export async function deleteAttachmentAction(attachmentId: string): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Требуется вход" };

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) return { error: "Файл не найден" };
  if (attachment.uploaderId !== session.user.id) {
    return { error: "Недостаточно прав" };
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  await deleteStoredFile(attachment.storedName);

  revalidatePath(`/auctions/${attachment.orderId}`);
  return {};
}
