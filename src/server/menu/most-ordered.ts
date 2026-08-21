/**
 * "Most Ordered" — a horizontal-scroll carousel of the site's best sellers
 * (src/components/customer/most-ordered-section.tsx), the way Wolt/UberEats
 * lead with a popular-items row before the category list.
 *
 * Ranked from real completed order volume — nothing here is curated or
 * guessed. Phase 2 has no checkout yet (no code creates an `Order` row
 * before Phase 3), so this returns `[]` until real orders exist, and the
 * section simply doesn't render — see the empty-array branch in
 * most-ordered-section.tsx. No placeholder/fake ranking, by design: a
 * "Most Ordered" section with invented data would be actively misleading
 * once customers can actually see what other people bought.
 */

import { prisma } from "@/server/db";
import { productIncludeForPublicMenu, toPublicProduct, type PublicProduct } from "./public-menu";

/** What counts as a real order for ranking purposes. Excludes DRAFT and
 * PENDING_PAYMENT (never actually happened), and REJECTED/CANCELLED/
 * ABANDONED/FAILED (happened, then un-happened) — a rejected order
 * shouldn't count toward a dish's popularity. Everything from PLACED
 * onward (payment authorized, per src/server/orders/state-machine.ts) is
 * a real order, whatever its current stage. */
const STATUSES_COUNTED_AS_ORDERED = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "AWAITING_PICKUP",
  "COMPLETED",
] as const;

const DEFAULT_LIMIT = 10;

export async function getMostOrderedProducts(limit = DEFAULT_LIMIT): Promise<PublicProduct[]> {
  const ranked = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { not: null },
      order: { status: { in: [...STATUSES_COUNTED_AS_ORDERED] } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });

  const rankedIds = ranked.map((r) => r.productId).filter((id): id is string => id !== null);
  if (rankedIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rankedIds }, deletedAt: null, isActive: true },
    include: productIncludeForPublicMenu,
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Re-applies the groupBy's rank order (Prisma's `in` filter doesn't
  // preserve it) and drops any product that's since been taken off the
  // menu entirely — a sold-out item still belongs here (same as the main
  // menu), a deleted/discontinued one doesn't.
  return rankedIds.map((id) => byId.get(id)).filter((p) => p !== undefined).map(toPublicProduct);
}
