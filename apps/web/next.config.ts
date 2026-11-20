import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

// .env stă la rădăcina monorepo-ului (folosit și de worker și de Prisma).
loadEnvConfig(path.resolve(__dirname, "../.."));

const config: NextConfig = {
  transpilePackages: ["@storyforge/core"],
  serverExternalPackages: ["@prisma/client"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
};
export default config;
