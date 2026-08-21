"use client";

import { useState } from "react";
import type { PublicProduct } from "@/server/menu/public-menu";
import { MostOrderedCard } from "./most-ordered-card";
import { ProductListSheet } from "./product-list-sheet";

/** How many show in the horizontal strip before "See all" is needed. */
const PREVIEW_COUNT = 10;

export function MostOrderedSection({
  products,
  onSelect,
}: {
  products: PublicProduct[];
  onSelect: (product: PublicProduct) => void;
}) {
  const [seeAllOpen, setSeeAllOpen] = useState(false);

  // No real orders yet (Phase 2 has no checkout) means no ranking to show
  // — see most-ordered.ts for why this is an empty array rather than a
  // guess, and why that's the right call rather than a placeholder.
  if (products.length === 0) return null;

  const preview = products.slice(0, PREVIEW_COUNT);

  return (
    <section className="pt-4">
      <div className="flex items-center justify-between px-3 sm:px-6">
        <h2 className="font-display text-xl font-semibold text-hg-ink">Most Ordered</h2>
        {/* Always shown, even when the preview already covers every ranked
            product — "See all" is also just a denser, no-scrolling view
            of the same list, not only an overflow escape hatch. */}
        <button
          type="button"
          onClick={() => setSeeAllOpen(true)}
          className="text-sm font-medium text-hg-red hover:underline"
        >
          See all
        </button>
      </div>
      <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:px-6">
        {preview.map((product) => (
          <MostOrderedCard key={product.id} product={product} onSelect={onSelect} />
        ))}
      </div>

      <ProductListSheet
        open={seeAllOpen}
        title="Most Ordered"
        products={products}
        onClose={() => setSeeAllOpen(false)}
        onSelectProduct={(product) => {
          setSeeAllOpen(false);
          onSelect(product);
        }}
      />
    </section>
  );
}
