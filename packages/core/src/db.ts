import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __sfPrisma?: PrismaClient };
export const prisma: PrismaClient = g.__sfPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__sfPrisma = prisma;
export type { PrismaClient };
