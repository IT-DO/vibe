import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 - нативный модуль. Next не должен пытаться его бандлить.
  serverExternalPackages: ["better-sqlite3"],
  // standalone-сборка нужна для маленького Docker-образа (см. Dockerfile)
  output: "standalone",
};

export default nextConfig;
