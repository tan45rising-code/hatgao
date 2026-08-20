/**
 * Self-healing for "sold out for today" (see `updateAvailabilityStatusAction`,
 * `src/app/admin/(protected)/menu/products/actions.ts`): flips any product
 * whose `availableAgainAt` has passed back to available.
 *
 * No scheduler needed for this in V1 — the admin product list is the only
 * place this currently matters, so checking lazily right before it renders
 * is equivalent to a cron that runs "whenever someone looks". Once a real
 * job runner exists (architecture doc A.5, later phase) this is a natural
 * candidate to move there instead — nothing about the call site would
 * need to change.
 *
 * Kept out of `src/server/menu/availability.ts` deliberately: that file is
 * pure (no I/O) and is imported directly by the domain test suite via
 * `tsx`, with no database connection. Adding a Prisma-touching function
 * there would couple that import to `DATABASE_URL` being resolvable for no
 * real benefit.
 */

import { prisma } from "@/server/db";

export async function syncExpiredAvailability(): Promise<void> {
  await prisma.product.updateMany({
    where: { availableAgainAt: { lte: new Date() } },
    data: { isAvailable: true, availableAgainAt: null },
  });
}
