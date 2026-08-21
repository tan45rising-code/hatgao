"use client";

import { useMemo, useState } from "react";
import type { PublicCategory, PublicProduct } from "@/server/menu/public-menu";
import { CategoryNav, categorySectionId } from "./category-nav";
import { CartDrawer } from "./cart-drawer";
import { MostOrderedSection } from "./most-ordered-section";
import { MostOrderedAllSheet } from "./most-ordered-all-sheet";
import { ProductCard } from "./product-card";
import { ProductDetailSheet } from "./product-detail-sheet";

export function MenuBrowser({
  categories,
  mostOrdered,
}: {
  categories: PublicCategory[];
  mostOrdered: PublicProduct[];
}) {
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);
  const [isMostOrderedAllOpen, setIsMostOrderedAllOpen] = useState(false);

  // Both derived from the same page-load data, so plain useMemo is enough
  // — no need to recompute these unless the menu itself changes.
  const allProducts = useMemo(() => categories.flatMap((c) => c.products), [categories]);
  const popularProductIds = useMemo(() => new Set(mostOrdered.map((p) => p.id)), [mostOrdered]);

  function selectFromMostOrderedAll(product: PublicProduct) {
    setIsMostOrderedAllOpen(false);
    setSelectedProduct(product);
  }

  return (
    <>
      <div className="mx-auto max-w-3xl">
        <MostOrderedSection
          products={mostOrdered}
          onSelect={setSelectedProduct}
          onSeeAll={() => setIsMostOrderedAllOpen(true)}
        />
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
                  isPopular={popularProductIds.has(product.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      <ProductDetailSheet product={selectedProduct} onClose={() => setSelectedProduct(null)} />

      <MostOrderedAllSheet
        open={isMostOrderedAllOpen}
        products={mostOrdered}
        onClose={() => setIsMostOrderedAllOpen(false)}
        onSelectProduct={selectFromMostOrderedAll}
      />

      <CartDrawer
        allProducts={allProducts}
        popularProductIds={popularProductIds}
        onSelectProduct={setSelectedProduct}
      />
    </>
  );
}
