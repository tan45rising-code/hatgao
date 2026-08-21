"use client";

import { formatCents } from "@/lib/money";
import type { PublicProduct } from "@/server/menu/public-menu";
import { ProductPhoto } from "./product-photo";

export function ProductCard({
  product,
  onSelect,
}: {
  product: PublicProduct;
  onSelect: (product: PublicProduct) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group flex w-full items-stretch gap-3 rounded-xl border border-hg-brown/10 bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-4 sm:p-4"
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
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-semibold text-hg-ink">{formatCents(product.priceCents)}</span>
          {product.containsAlcohol && (
            <span className="rounded-full bg-hg-gold/20 px-2 py-0.5 text-[11px] font-medium text-hg-brown">
              18+ · collection only
            </span>
          )}
        </div>
      </div>
      <ProductPhoto
        src={product.imageUrl}
        alt={product.imageAlt ?? product.name}
        className="h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-24"
      />
    </button>
  );
}
