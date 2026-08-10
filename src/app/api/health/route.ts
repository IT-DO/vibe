import { prisma } from "@/lib/prisma";

// Публичный, без секретов — используется Docker healthcheck'ом (см.
// docker-compose.yml) и может дёргаться внешним аптайм-монитором.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
