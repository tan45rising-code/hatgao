"use client";

import { useMemo, useState } from "react";
import type { PublicCategory, PublicProduct } from "@/server/menu/public-menu";
import { CategoryNav, categorySectionId } from "./category-nav";
import { CartDrawer } from "./cart-drawer";
import { MostOrderedSection } from "./most-ordered-section";
import { ProductCard } from "./product-card";
import { ProductDetailSheet } from "./product-detail-sheet";

/** Only the top 5 of the Most Ordered ranking get the "Popular" badge —
 * the ranking itself (mostOrdered, up to 30) is still used in full as the
 * relevance tiebreaker for recommendations, which is a different concern
 * from what earns a badge on the card. */
const POPULAR_BADGE_COUNT = 5;

export function MenuBrowser({
  categories,
  mostOrdered,
}: {
  categories: PublicCategory[];
  mostOrdered: PublicProduct[];
}) {
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);

  // All derived from the same page-load data, so plain useMemo is enough
  // — no need to recompute these unless the menu itself changes.
  const allProducts = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const popularProductIds = useMemo(() => new Set(mostOrdered.map((p) => p.id)), [mostOrdered]);
  const popularBadgeIds = useMemo(
    () => new Set(mostOrdered.slice(0, POPULAR_BADGE_COUNT).map((p) => p.id)),
    [mostOrdered],
  );

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <MostOrderedSection products={mostOrdered} onSelect={setSelectedProduct} />
      </div>

      <CategoryNav categories={categories} />

      <main className="mx-auto max-w-3xl px-3 pb-28 pt-4 sm:px-6">
        {categories.map((category) => (
          <section
            key={category.id}
            id={categorySectionId(category.id)}
            data-category-id={category.id}
            className="scroll-mt-16 py-4"
          >
            <h2 className="font-display mb-1 text-xl font-semibold text-hg-ink">{category.name}</h2>
            {category.description && (
              <p className="mb-3 text-sm text-hg-brown/60">{category.description}</p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {category.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={setSelectedProduct}
                  isPopular={popularBadgeIds.has(product.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <ProductDetailSheet
        product={selectedProduct}
        allProducts={allProducts}
        popularProductIds={popularProductIds}
        onClose={() => setSelectedProduct(null)}
        onSelectProduct={setSelectedProduct}
      />

      <CartDrawer
        allProducts={allProducts}
        popularProductIds={popularProductIds}
        onSelectProduct={setSelectedProduct}
      />
    </>
  );
}
