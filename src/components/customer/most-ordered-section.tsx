"use client";

import type { PublicProduct } from "@/server/menu/public-menu";
import { MostOrderedCard } from "./most-ordered-card";

export function MostOrderedSection({
  products,
  onSelect,
}: {
  products: PublicProduct[];
  onSelect: (product: PublicProduct) => void;
}) {
  // No real orders yet (Phase 2 has no checkout) means no ranking to show
  // — see most-ordered.ts for why this is an empty array rather than a
  // guess, and why that's the right call rather than a placeholder.
  if (products.length === 0) return null;

  return (
    <section className="pt-4">
      <h2 className="font-display px-3 text-xl font-semibold text-hg-ink sm:px-6">Most Ordered</h2>
      <div className="scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-3 pb-2 sm:px-6">
        {products.map((product) => (
          <MostOrderedCard key={product.id} product={product} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}
