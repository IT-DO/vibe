import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { LOCALES, INTL_LOCALE, localePath } from "@/lib/i18n/config";
import { getSiteUrl } from "@/lib/seo";

// Карта сайта строится из базы (открытые аукционы, профили специалистов) и из
// настроек площадки, поэтому её нельзя пререндерить на этапе сборки: там нет
// ни базы, ни DATABASE_URL. Отдаём на каждый запрос.
export const dynamic = "force-dynamic";

// Карта сайта строится как «страница × язык»: у каждой языковой версии свой
// адрес и блок alternates с остальными языками — это то, по чему поисковик
// понимает, что это переводы одного документа, а не дубли.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();

  const staticPages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "daily" },
    { path: "/auctions", priority: 0.9, changeFrequency: "daily" },
    { path: "/executors", priority: 0.9, changeFrequency: "daily" },
    { path: "/materials", priority: 0.7, changeFrequency: "monthly" },
    { path: "/offer", priority: 0.3, changeFrequency: "monthly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  ];

  // В карту попадают только публично доступные сущности: открытые аукционы и
  // профили специалистов. Личный кабинет, оплата и админка не индексируются
  // вовсе (см. robots.ts).
  const [orders, specialists] = await Promise.all([
    prisma.order.findMany({
      where: { status: "OPEN" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 5000,
    }),
    prisma.user.findMany({
      where: { role: { in: ["EXECUTOR", "DESIGNER"] } },
      select: { id: true },
      take: 5000,
    }),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  function push(path: string, opts: { priority: number; changeFrequency: "daily" | "weekly" | "monthly"; lastModified?: Date }) {
    const languages: Record<string, string> = {};
    for (const locale of LOCALES) {
      languages[INTL_LOCALE[locale]] = `${siteUrl}${localePath(path, locale)}`;
    }
    for (const locale of LOCALES) {
      entries.push({
        url: `${siteUrl}${localePath(path, locale)}`,
        lastModified: opts.lastModified,
        changeFrequency: opts.changeFrequency,
        priority: opts.priority,
        alternates: { languages },
      });
    }
  }

  for (const page of staticPages) {
    push(page.path, { priority: page.priority, changeFrequency: page.changeFrequency });
  }
  for (const order of orders) {
    push(`/auctions/${order.id}`, { priority: 0.6, changeFrequency: "daily", lastModified: order.updatedAt });
  }
  for (const person of specialists) {
    push(`/u/${person.id}`, { priority: 0.5, changeFrequency: "weekly" });
  }

  return entries;
}
