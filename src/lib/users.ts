import "server-only";
import { prisma } from "@/lib/prisma";

export function getExecutors(params?: { material?: string; city?: string }) {
  return prisma.user.findMany({
    where: {
      role: "EXECUTOR",
      ...(params?.material ? { materials: { contains: params.material } } : {}),
      ...(params?.city ? { city: { contains: params.city } } : {}),
    },
    orderBy: [{ ratingAvg: "desc" }, { ratingCount: "desc" }],
  });
}

export function getUserProfile(id: string) {
  return prisma.user.findUnique({
    where: { id },
    include: {
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
