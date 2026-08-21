/**
 * Category-gap-filling recommendations, used in two places:
 *   - getProductPageRecommendations: "Often bought with" at the bottom of
 *     a product's detail popup (product-detail-sheet.tsx) — excludes that
 *     product's own category (no point suggesting 3 more of what they're
 *     already looking at) plus whatever's already in the cart.
 *   - getCartRecommendations: "Recommended for you" in the cart drawer
 *     (cart-drawer.tsx) — excludes only what's already in the cart.
 *
 * Neither is "customers who bought X also bought Y" — that needs real
 * co-purchase history (which pairs of items showed up on the same order
 * together, repeatedly), and Phase 2 has zero real orders, let alone
 * repeated pairings. That bar is much higher than Most Ordered's (which
 * only needs *some* order history to rank individual items) — see
 * src/server/menu/most-ordered.ts for that reasoning.
 *
 * Instead this looks at which categories are already spoken for and
 * suggests good picks from the ones that aren't — no drink yet? suggest
 * drinks. No starter? suggest starters. Works immediately with zero order
 * history and gets smarter for free once real popularity data exists
 * (used as the tiebreaker), but never needs orders to function at all.
 */

import type { Cart } from "./types";
import type { PublicProduct } from "@/server/menu/public-menu";

const CART_RECOMMENDATION_LIMIT = 20;
const PRODUCT_PAGE_RECOMMENDATION_LIMIT = 6;

function pickRecommendations(
  excludedProductIds: ReadonlySet<string>,
  excludedCategoryIds: ReadonlySet<string>,
  allProducts: PublicProduct[],
  popularProductIds: ReadonlySet<string>,
  limit: number,
): PublicProduct[] {
  // Never suggest something already excluded or currently unorderable.
  const eligible = allProducts.filter((p) => p.isAvailable && !excludedProductIds.has(p.id));

  // Popular items first (once that data exists); ties fall back to the
  // menu's own order, which is already what the restaurant intends people
  // to see first within a category.
  const byRelevance = (a: PublicProduct, b: PublicProduct) => {
    const aPopular = popularProductIds.has(a.id) ? 0 : 1;
    const bPopular = popularProductIds.has(b.id) ? 0 : 1;
    return aPopular - bPopular;
  };

  const missingCategory = eligible.filter((p) => !excludedCategoryIds.has(p.categoryId));
  const sameCategory = eligible.filter((p) => excludedCategoryIds.has(p.categoryId));

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

  // Round 3: still short (small catalog, or every category is already
  // spoken for) — round out with more from categories already excluded.
  if (picks.length < limit) {
    take([...sameCategory].sort(byRelevance));
  }

  return picks;
}

/** Preview lengths (2×4 grid, 2×3 grid) are just `.slice()`s of this same
 * ordering — computing the longer list once and slicing keeps a preview
 * and its own "show more" from ever visibly disagreeing with each other. */
export function getCartRecommendations(
  cart: Cart,
  allProducts: PublicProduct[],
  popularProductIds: ReadonlySet<string>,
  limit = CART_RECOMMENDATION_LIMIT,
): PublicProduct[] {
  const excludedProductIds = new Set(cart.lines.map((l) => l.productId));
  const excludedCategoryIds = new Set(cart.lines.map((l) => l.categoryId));
  return pickRecommendations(excludedProductIds, excludedCategoryIds, allProducts, popularProductIds, limit);
}

export function getProductPageRecommendations(
  product: PublicProduct,
  cart: Cart,
  allProducts: PublicProduct[],
  popularProductIds: ReadonlySet<string>,
  limit = PRODUCT_PAGE_RECOMMENDATION_LIMIT,
): PublicProduct[] {
  const excludedProductIds = new Set([product.id, ...cart.lines.map((l) => l.productId)]);
  const excludedCategoryIds = new Set([product.categoryId, ...cart.lines.map((l) => l.categoryId)]);
  return pickRecommendations(excludedProductIds, excludedCategoryIds, allProducts, popularProductIds, limit);
}
