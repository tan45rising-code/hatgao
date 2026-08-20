/**
 * Shared Prisma Client.
 *
 * Next.js hot-reloads modules in dev, and a naive `new PrismaClient()` at
 * the top of this file would spin up a fresh connection pool on every save,
 * eventually exhausting Postgres's connection limit. Stashing the instance
 * on `globalThis` survives the reload; production gets a clean singleton
 * since the global is never populated there in the first place.
 */

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
