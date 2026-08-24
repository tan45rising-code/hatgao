"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShoppingBag, Trash2, X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart/cart-context";
import { cartLineTotalCents, cartTotalCents } from "@/lib/cart/types";
import { getCartRecommendations } from "@/lib/cart/recommendations";
import { useDragToClose } from "@/lib/use-drag-to-close";
import type { PublicProduct } from "@/server/menu/public-menu";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { MostOrderedCard } from "./most-ordered-card";
import { ProductListSheet } from "./product-list-sheet";
import { ProductPhoto } from "./product-photo";
import { SwipeableCartLine } from "./swipeable-cart-line";

/** 2 columns × 4 rows before "Show all" — the full list (up to 20, see
 * recommendations.ts) lives behind that button instead. */
const PREVIEW_COUNT = 8;

export function CartDrawer({
  allProducts,
  popularProductIds,
  onSelectProduct,
}: {
  allProducts: PublicProduct[];
  popularProductIds: ReadonlySet<string>;
  onSelectProduct: (product: PublicProduct) => void;
}) {
  const { cart, isDrawerOpen, closeDrawer, updateQuantity, removeLine } = useCart();
  const total = cartTotalCents(cart);
  const [showAllOpen, setShowAllOpen] = useState(false);

  const recommendations = useMemo(
    () => getCartRecommendations(cart, allProducts, popularProductIds),
    [cart, allProducts, popularProductIds],
  );
  const preview = recommendations.slice(0, PREVIEW_COUNT);

  // Locks the page behind the drawer, same as ProductDetailSheet and
  // ProductListSheet — this drawer was the one place that didn't, and it
  // showed: swiping down from a zone this component doesn't specifically
  // instrument (the empty-cart state before the fix below, or the fixed
  // "Estimated total" footer, which never scrolls and was never meant to)
  // fell straight through to the real page underneath. With the body
  // still scrollable, that's not a no-op — it's a live touchmove on the
  // actual menu page, which is what dragged its scroll position around
  // (and, at the very top of that page, is exactly what native
  // pull-to-refresh treats as a pull).
  useEffect(() => {
    if (!isDrawerOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  function handleSelectRecommendation(product: PublicProduct) {
    // Leaving the drawer to look at a recommended item, rather than
    // stacking a second overlay on top of it — same reasoning as closing
    // the detail sheet before opening the drawer on add-to-cart.
    closeDrawer();
    onSelectProduct(product);
  }

  // Swipe DOWN to close (not right, even though the drawer itself still
  // slides in from the right) — matches the same gesture as every other
  // sheet in the app. Available from the header (always) and from within
  // the scrollable cart list itself (only once scrolled to the top —
  // dragContentRef backs off otherwise so normal scrolling still works).
  // Each line's own horizontal swipe-to-delete (SwipeableCartLine) is a
  // separate, axis-locked gesture that stops this one from ever seeing it.
  const {
    offset: dragOffset,
    dragging,
    settling,
    headerRef: dragHeaderRef,
    contentRef: dragContentRef,
  } = useDragToClose("y", closeDrawer);

  return (
    <div
      aria-hidden={!isDrawerOpen}
      className={cn(
        "fixed inset-0 z-50 transition-opacity duration-200",
        isDrawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="absolute inset-0 bg-hg-ink/50" onClick={closeDrawer} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your order"
        style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-hg-bg shadow-xl",
          (settling || !dragging) && "transition-transform duration-500 ease-out",
          !dragging && (isDrawerOpen ? "translate-x-0" : "translate-x-full"),
        )}
      >
        <div
          className="flex shrink-0 items-center justify-between border-b border-hg-brown/10 bg-white px-5 py-4"
          ref={dragHeaderRef}
        >
          <h2 className="font-display text-lg font-semibold text-hg-ink">Your order</h2>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close cart"
            className="flex h-8 w-8 items-center justify-center rounded-full text-hg-brown hover:bg-hg-bg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {cart.lines.length === 0 ? (
          // Same close-drag zone as the real cart list below (dragContentRef)
          // even though there's nothing to scroll here — without it, a swipe
          // starting in this empty area wasn't claimed by anything, and fell
          // through to the page behind the (now correctly scroll-locked)
          // drawer.
          <div
            ref={dragContentRef}
            className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <ShoppingBag className="h-10 w-10 text-hg-brown/30" strokeWidth={1.5} />
            <p className="text-sm text-hg-brown/60">Your cart is empty — add something tasty from the menu.</p>
          </div>
        ) : (
          <>
            <div ref={dragContentRef} className="flex-1 overflow-y-auto overscroll-contain py-4">
              <ul className="space-y-4 px-5">
                {cart.lines.map((line) => (
                  <li key={line.lineId}>
                    <SwipeableCartLine onDelete={() => removeLine(line.lineId)}>
                      <div className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
                        <ProductPhoto
                          src={line.imageUrl}
                          alt={line.name}
                          className="h-16 w-16 shrink-0 rounded-lg"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-hg-ink">{line.name}</p>
                            <button
                              type="button"
                              onClick={() => removeLine(line.lineId)}
                              aria-label={`Remove ${line.name}`}
                              className="shrink-0 text-hg-brown/40 hover:text-hg-red"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {line.modifiers.length > 0 && (
                            <p className="mt-0.5 truncate text-xs text-hg-brown/60">
                              {line.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          {line.notes && (
                            <p className="mt-0.5 truncate text-xs italic text-hg-brown/50">
                              &ldquo;{line.notes}&rdquo;
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-between">
                            <QuantityStepper
                              value={line.quantity}
                              onChange={(q) => updateQuantity(line.lineId, q)}
                              className="scale-90 origin-left"
                            />
                            <span className="text-sm font-semibold text-hg-ink">
                              {formatCents(cartLineTotalCents(line))}
                            </span>
                          </div>
                        </div>
                      </div>
                    </SwipeableCartLine>
                  </li>
                ))}
              </ul>

              {preview.length > 0 && (
                <div className="mt-5 px-5">
                  <h3 className="mb-2 text-sm font-semibold text-hg-ink">Recommended for you</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {preview.map((product) => (
                      <MostOrderedCard
                        key={product.id}
                        product={product}
                        onSelect={handleSelectRecommendation}
                        className="w-full"
                      />
                    ))}
                  </div>
                  {recommendations.length > PREVIEW_COUNT && (
                    <button
                      type="button"
                      onClick={() => setShowAllOpen(true)}
                      className="mt-3 w-full rounded-full border border-hg-brown/20 bg-white px-5 py-2 text-sm font-semibold text-hg-ink transition-colors hover:bg-hg-bg"
                    >
                      Show all
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-hg-brown/10 bg-white px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-hg-brown/70">Estimated total</span>
                <span className="text-base font-semibold text-hg-ink">{formatCents(total)}</span>
              </div>
              <Link
                href="/checkout"
                onClick={closeDrawer}
                className="block w-full rounded-full bg-hg-red px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-hg-red/90"
              >
                Checkout
              </Link>
            </div>
          </>
        )}
      </div>

      <ProductListSheet
        open={showAllOpen}
        title="Recommended for you"
        products={recommendations}
        variant="compact"
        onClose={() => setShowAllOpen(false)}
        onSelectProduct={(product) => {
          setShowAllOpen(false);
          handleSelectRecommendation(product);
        }}
      />
    </div>
  );
}
