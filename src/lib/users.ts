import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/constants";

// Публичные поля профиля — passwordHash сюда осознанно не включён нигде в этом
// файле, чтобы он в принципе не мог утечь клиенту через сериализацию пропсов
// Server → Client Component.
const publicUserSelect = {
  id: true,
  name: true,
  role: true,
  city: true,
  bio: true,
  avatarUrl: true,
  createdAt: true,
  ratingAvg: true,
  ratingCount: true,
  specialization: true,
  materials: true,
  printer: true,
  pricePerGram: true,
  portfolio: true,
} as const;

export async function getSpecialists(params?: {
  role?: Role;
  material?: string;
  city?: string;
  minRating?: number;
  minCompletedOrders?: number;
  sortBy?: "rating" | "reviews" | "completedOrders";
}) {
  const specialists = await prisma.user.findMany({
    where: {
      role: params?.role ? params.role : { in: ["EXECUTOR", "DESIGNER"] },
      ...(params?.material ? { materials: { contains: params.material } } : {}),
      ...(params?.city ? { city: { contains: params.city } } : {}),
      ...(params?.minRating ? { ratingAvg: { gte: params.minRating } } : {}),
    },
    select: publicUserSelect,
    orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
  });

  // Количество выполненных заказов на исполнителя — считаем отдельным
  // groupBy вместо N+1 запросов на каждого специалиста в списке.
  const completedCounts = await prisma.bid.groupBy({
    by: ["executorId"],
    where: { status: "ACCEPTED", order: { status: "COMPLETED" } },
    _count: { _all: true },
  });
  const completedById = new Map(completedCounts.map((c) => [c.executorId, c._count._all]));

  let withCounts = specialists.map((person) => ({
    ...person,
    completedOrders: completedById.get(person.id) ?? 0,
  }));

  if (params?.minCompletedOrders) {
    withCounts = withCounts.filter((p) => p.completedOrders >= params.minCompletedOrders!);
  }

  if (params?.sortBy === "reviews") {
    withCounts.sort((a, b) => b.ratingCount - a.ratingCount);
  } else if (params?.sortBy === "completedOrders") {
    withCounts.sort((a, b) => b.completedOrders - a.completedOrders);
  }
  // sortBy === "rating" (default) — уже отсортировано запросом выше.

  return withCounts;
}

export function getUserProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      ...publicUserSelect,
      reviewsReceived: {
        include: {
          author: { select: { id: true, name: true, role: true } },
          order: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

// Профиль для формы редактирования: те же публичные поля, без passwordHash —
// эта функция обязательно к использованию вместо прямого prisma.user.findUnique
// на страницах, которые передают результат в клиентский компонент.
export function getOwnProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: publicUserSelect,
  });
}

export async function recalculateRating(userId: string) {
  const agg = await prisma.review.aggregate({
    where: { targetId: userId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      ratingAvg: agg._avg.rating ?? 0,
      ratingCount: agg._count.rating,
    },
  });
}
