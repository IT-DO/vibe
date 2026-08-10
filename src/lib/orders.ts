import "server-only";
import { prisma } from "@/lib/prisma";

const customerSelect = {
  select: { id: true, name: true, city: true, ratingAvg: true, ratingCount: true },
} as const;

const executorSelect = {
  select: { id: true, name: true, city: true, ratingAvg: true, ratingCount: true },
} as const;

export function getOpenOrders(params?: { material?: string; q?: string }) {
  return prisma.order.findMany({
    where: {
      status: "OPEN",
      ...(params?.material ? { material: params.material } : {}),
      ...(params?.q
        ? {
            OR: [
              { title: { contains: params.q } },
              { description: { contains: params.q } },
            ],
          }
        : {}),
    },
    include: {
      customer: customerSelect,
      bids: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getOrderById(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      customer: customerSelect,
      bids: {
        include: { executor: executorSelect },
        orderBy: { price: "asc" },
      },
      reviews: true,
    },
  });
}

export function getOrdersByCustomer(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    include: {
      bids: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function getBidsByExecutor(executorId: string) {
  return prisma.bid.findMany({
    where: { executorId },
    include: {
      order: {
        include: { customer: customerSelect },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
