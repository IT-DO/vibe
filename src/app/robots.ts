import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/seo";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Личные и служебные разделы закрыты от обхода: в выдаче им делать
        // нечего, а краулерный бюджет они тратят. Доступ к ним всё равно
        // защищён авторизацией — robots.txt тут только про индексацию.
        disallow: [
          "/api/",
          "/admin",
          "/dashboard",
          "/billing",
          "/profile",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
