"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/money";
import type { PublicProduct } from "@/server/menu/public-menu";
import { ProductPhoto } from "./product-photo";

export function ProductCard({
  product,
  onSelect,
  isPopular = false,
}: {
  product: PublicProduct;
  onSelect: (product: PublicProduct) => void;
  /** Whether this product is in the Most Ordered ranking — omit (or pass
   * false) anywhere that's already implied, e.g. inside the Most Ordered
   * carousel/See-all view itself, where every card would show it. */
  isPopular?: boolean;
}) {
  const soldOut = !product.isAvailable;

  // A sold-out item still shows (see public-menu.ts) but isn't a real
  // button — nothing useful happens if you tap it, so it shouldn't look
  // or behave like one.
  const Tag = soldOut ? "div" : "button";

  return (
    <Tag
      type={soldOut ? undefined : "button"}
      onClick={soldOut ? undefined : () => onSelect(product)}
      aria-disabled={soldOut || undefined}
      className={cn(
        "group flex w-full items-stretch gap-3 rounded-xl border border-hg-brown/10 bg-white p-3 text-left shadow-sm transition-all sm:gap-4 sm:p-4",
        soldOut ? "opacity-70" : "hover:-translate-y-0.5 hover:shadow-md",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {product.menuNumber !== null && (
            <span className="shrink-0 text-xs font-semibold text-hg-red">#{product.menuNumber}</span>
          )}
          <h3 className="truncate font-display text-base font-semibold text-hg-ink sm:text-lg">
            {product.name}
          </h3>
        </div>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-sm text-hg-brown/70">{product.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-hg-ink">{formatCents(product.priceCents)}</span>
          {isPopular && (
            <span className="flex items-center gap-1 rounded-full bg-hg-red/10 px-2 py-0.5 text-[11px] font-medium text-hg-red">
              <Flame className="h-3 w-3" />
              Popular
            </span>
          )}
          {soldOut && (
            <span className="rounded-full bg-hg-ink/10 px-2 py-0.5 text-[11px] font-medium text-hg-brown">
              Sold out
            </span>
          )}
          {product.containsAlcohol && (
            <span className="rounded-full bg-hg-gold/20 px-2 py-0.5 text-[11px] font-medium text-hg-brown">
              18+ · collection only
            </span>
          )}
        </div>
      </div>
      <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
        <ProductPhoto
          src={product.imageUrl}
          alt={product.imageAlt ?? product.name}
          className={cn("h-full w-full rounded-lg", soldOut && "grayscale")}
        />
        {soldOut && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-hg-ink/40">
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-hg-ink">
              Sold out
            </span>
          </div>
        )}
      </div>
    </Tag>
  );
}
