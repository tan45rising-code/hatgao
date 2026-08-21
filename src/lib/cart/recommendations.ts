/**
 * "Often bought with" — shown in the cart drawer (cart-drawer.tsx), reacts
 * to the current cart's contents.
 *
 * This is NOT "customers who bought X also bought Y" — that needs real
 * co-purchase history (which pairs of items showed up on the same order
 * together, repeatedly), and Phase 2 has zero real orders, let alone
 * repeated pairings. That bar is much higher than Most Ordered's (which
 * only needs *some* order history to rank individual items) — see
 * src/server/menu/most-ordered.ts for that reasoning.
 *
 * Instead this is a category-gap heuristic: look at which categories are
 * already in the cart, and suggest good picks from the categories that
 * AREN'T — no drink in the cart yet? suggest drinks. No starter? suggest
 * starters. This works immediately with zero order history and gets
 * smarter for free once real popularity data exists (it's used as the
 * tiebreaker), but it never needs orders to function at all.
 */

import type { Cart } from "./types";
import type { PublicProduct } from "@/server/menu/public-menu";

const DEFAULT_LIMIT = 6;

export function getCartRecommendations(
  cart: Cart,
  allProducts: PublicProduct[],
  popularProductIds: ReadonlySet<string>,
  limit = DEFAULT_LIMIT,
): PublicProduct[] {
  const inCartProductIds = new Set(cart.lines.map((l) => l.productId));
  const inCartCategoryIds = new Set(cart.lines.map((l) => l.categoryId));

  // Never suggest something already in the cart or currently unorderable.
  const eligible = allProducts.filter((p) => p.isAvailable && !inCartProductIds.has(p.id));

  // Popular items first (once that data exists); ties fall back to the
  // menu's own order, which is already what the restaurant intends people
  // to see first within a category.
  const byRelevance = (a: PublicProduct, b: PublicProduct) => {
    const aPopular = popularProductIds.has(a.id) ? 0 : 1;
    const bPopular = popularProductIds.has(b.id) ? 0 : 1;
    return aPopular - bPopular;
  };

  const missingCategory = eligible.filter((p) => !inCartCategoryIds.has(p.categoryId));
  const sameCategory = eligible.filter((p) => inCartCategoryIds.has(p.categoryId));

  const picks: PublicProduct[] = [];
  const pickedIds = new Set<string>();
  function take(candidates: PublicProduct[]) {
    for (const p of candidates) {
      if (picks.length >= limit) return;
      if (pickedIds.has(p.id)) continue;
      picks.push(p);
      pickedIds.add(p.id);
    }
  }

  // Round 1: one best pick per missing category first, so a cart with no
  // drink AND no starter gets both represented rather than 6 drinks.
  const byCategory = new Map<string, PublicProduct[]>();
  for (const p of missingCategory) {
    const list = byCategory.get(p.categoryId) ?? [];
    list.push(p);
    byCategory.set(p.categoryId, list);
  }
  for (const list of byCategory.values()) list.sort(byRelevance);
  take([...byCategory.values()].map((list) => list[0]!));

  // Round 2: still short — fill with the next-best items from those same
  // missing categories.
  if (picks.length < limit) {
    take([...missingCategory].sort(byRelevance));
  }

  // Round 3: still short (small catalog, or the cart already spans every
  // category) — round out with more from categories already in the cart.
  if (picks.length < limit) {
    take([...sameCategory].sort(byRelevance));
  }

  return picks;
}
