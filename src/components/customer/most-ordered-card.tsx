"use client";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import type { PublicProduct } from "@/server/menu/public-menu";
import { ProductPhoto } from "./product-photo";

/**
 * The compact, vertical (photo-on-top) card for the horizontal-scrolling
 * "Most Ordered" row — src/components/customer/most-ordered-section.tsx.
 * Deliberately a separate component from ProductCard (the wide list-style
 * card the category sections use): same underlying PublicProduct and the
 * same tap-to-open-detail-sheet behavior, but a carousel item needs a
 * fixed width and a top-down layout, not a full-width row.
 */
export function MostOrderedCard({
  product,
  onSelect,
  className,
}: {
  product: PublicProduct;
  onSelect: (product: PublicProduct) => void;
  /** Overrides the default fixed carousel width — pass "w-full" when this
   * is laid out in a grid instead of a horizontal scroll strip (e.g.
   * product-list-sheet.tsx's "compact" variant). */
  className?: string;
}) {
  const soldOut = !product.isAvailable;
  const Tag = soldOut ? "div" : "button";

  return (
    <Tag
      type={soldOut ? undefined : "button"}
      onClick={soldOut ? undefined : () => onSelect(product)}
      aria-disabled={soldOut || undefined}
      className={cn(
        "flex w-32 shrink-0 snap-start flex-col rounded-xl border border-hg-brown/10 bg-white p-2 text-left shadow-sm transition-all sm:w-36",
        soldOut ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <div className="relative aspect-square w-full">
        <ProductPhoto
          src={product.imageUrl}
          alt={product.imageAlt ?? product.name}
          className={cn("h-full w-full rounded-lg", soldOut && "grayscale")}
        />
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-hg-ink/40">
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-hg-ink">
              Sold out
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-hg-ink">{product.name}</p>
      <p className="mt-1 text-sm font-semibold text-hg-ink">{formatCents(product.priceCents)}</p>
    </Tag>
  );
}
