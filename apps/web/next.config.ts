import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

// .env stă la rădăcina monorepo-ului (folosit și de worker și de Prisma).
loadEnvConfig(path.resolve(__dirname, "../.."));
// rădăcina repo-ului: căile relative din .env (STORAGE_DIR, WORK_DIR) se rezolvă față de ea
process.env.STORYFORGE_ROOT ??= path.resolve(__dirname, "../..");

const config: NextConfig = {
  transpilePackages: ["@storyforge/core"],
  serverExternalPackages: ["@prisma/client", "mammoth", "unpdf", "@aws-sdk/client-s3"],
  experimental: { serverActions: { bodySizeLimit: "32mb" } },
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
};
export default config;
