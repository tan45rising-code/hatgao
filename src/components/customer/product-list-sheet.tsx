"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDragToClose } from "@/lib/use-drag-to-close";
import type { PublicProduct } from "@/server/menu/public-menu";
import { ProductCard } from "./product-card";
import { MostOrderedCard } from "./most-ordered-card";

/** See the matching comment in product-detail-sheet.tsx — two frames
 * instead of one is the more reliable way to guarantee the browser has
 * actually painted the "closed" state before flipping to "open", so the
 * transition reliably animates instead of occasionally snapping open. */
function nextFrame(cb: () => void): () => void {
  let raf2 = 0;
  const raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(cb);
  });
  return () => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  };
}

/**
 * The "show everything" sheet behind a preview strip/grid — used for both
 * "Most Ordered → See all" (most-ordered-section.tsx) and
 * "Recommended for you → Show all" (cart-drawer.tsx). Same open/close
 * animation pattern as ProductDetailSheet, including the same fix for the
 * "invisible overlay still eats taps mid-close" bug: `onClose` fires
 * immediately on request, and this component's own `visible` is purely a
 * local animation flag driven off the `open` prop, not something a close
 * request has to wait 200ms to hand back control of.
 *
 * Two variants because the two callers want different densities:
 * "detailed" is the regular wide ProductCard (with description), 1 column
 * on mobile / 2 on larger screens — right for "here's the whole popular
 * menu". "compact" is the small vertical card, a strict 2 columns even on
 * mobile — right for a shorter, denser suggestion list, and matches the
 * preview grid it's expanding on from.
 */
export function ProductListSheet({
  open,
  title,
  products,
  variant = "detailed",
  onClose,
  onSelectProduct,
}: {
  open: boolean;
  title: string;
  products: PublicProduct[];
  variant?: "detailed" | "compact";
  onClose: () => void;
  onSelectProduct: (product: PublicProduct) => void;
}) {
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      return nextFrame(() => setVisible(true));
    }
    if (rendered) {
      setVisible(false);
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rendered is read, not a trigger; only `open` should re-run this
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [rendered, onClose]);

  const { offset: dragOffset, dragging, settling, headerRef: dragHeaderRef } = useDragToClose("y", onClose);

  if (!rendered) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 bg-hg-ink/50 transition-opacity duration-200",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-hg-bg sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          (settling || !dragging) && "transition-transform duration-200",
          !dragging && (visible ? "translate-y-0 sm:scale-100" : "translate-y-full sm:scale-95 sm:opacity-0"),
        )}
      >
        {/* Drag handle + header are the swipe-down-to-close zone — not the
            scrollable grid below, so scrolling the list itself is never
            mistaken for a close gesture. */}
        <div className="shrink-0 border-b border-hg-brown/10 bg-white" ref={dragHeaderRef}>
          <div className="flex justify-center pb-1 pt-2">
            <div className="h-1 w-10 rounded-full bg-hg-brown/20" />
          </div>
          <div className="flex items-center justify-between px-5 pb-4">
            <h2 className="font-display text-lg font-semibold text-hg-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-full text-hg-brown hover:bg-hg-bg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5">
          {variant === "detailed" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} onSelect={onSelectProduct} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {products.map((product) => (
                <MostOrderedCard
                  key={product.id}
                  product={product}
                  onSelect={onSelectProduct}
                  className="w-full"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
