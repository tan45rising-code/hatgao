"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicProduct } from "@/server/menu/public-menu";
import { ProductCard } from "./product-card";

/**
 * "See all" behind the Most Ordered carousel — the same ranked list
 * (most-ordered-section.tsx only previews the first few), shown in full
 * as a 2-column grid via the regular ProductCard rather than the
 * carousel's compact one. Same open/close animation pattern as
 * ProductDetailSheet.
 */
export function MostOrderedAllSheet({
  open,
  products,
  onClose,
  onSelectProduct,
}: {
  open: boolean;
  products: PublicProduct[];
  onClose: () => void;
  onSelectProduct: (product: PublicProduct) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setVisible(true));
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable over this effect's lifetime
  }, [open]);

  function handleClose() {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 bg-hg-ink/50 transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Most Ordered"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-hg-bg transition-transform duration-200 sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          visible ? "translate-y-0 sm:scale-100" : "translate-y-full sm:scale-95 sm:opacity-0",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-hg-brown/10 bg-white px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-hg-ink">Most Ordered</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-hg-brown hover:bg-hg-bg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} onSelect={onSelectProduct} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
