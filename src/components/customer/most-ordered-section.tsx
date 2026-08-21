"use client";

import type { PublicProduct } from "@/server/menu/public-menu";
import { MostOrderedCard } from "./most-ordered-card";

/** How many show in the horizontal strip before "See all" is needed. */
const PREVIEW_COUNT = 8;

export function MostOrderedSection({
  products,
  onSelect,
  onSeeAll,
}: {
  products: PublicProduct[];
  onSelect: (product: PublicProduct) => void;
  onSeeAll: () => void;
}) {
  // No real orders yet (Phase 2 has no checkout) means no ranking to show
  // — see most-ordered.ts for why this is an empty array rather than a
  // guess, and why that's the right call rather than a placeholder.
  if (products.length === 0) return null;

  const preview = products.slice(0, PREVIEW_COUNT);

  return (
    <section className="pt-4">
      <div className="flex items-center justify-between px-3 sm:px-6">
        <h2 className="font-display text-xl font-semibold text-hg-ink">Most Ordered</h2>
        {products.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-sm font-medium text-hg-red hover:underline"
          >
            See all
          </button>
        )}
      </div>
      <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:px-6">
        {preview.map((product) => (
          <MostOrderedCard key={product.id} product={product} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
