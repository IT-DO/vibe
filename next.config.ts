import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Позволяет прикладывать несколько файлов (STL/STEP/изображения) за раз;
      // конкретные лимиты на файл/заказ проверяются отдельно в src/lib/storage.ts.
      bodySizeLimit: "100mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Запрещает встраивать сайт в чужой <iframe> (защита от clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Запрещает браузеру угадывать Content-Type — актуально в т.ч. для
          // скачиваемых пользовательских файлов (см. /api/attachments/[id]).
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
