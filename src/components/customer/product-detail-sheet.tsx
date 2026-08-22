"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn, mergeRefs } from "@/lib/utils";
import { useCart } from "@/lib/cart/cart-context";
import { getProductPageRecommendations } from "@/lib/cart/recommendations";
import { useDragToClose } from "@/lib/use-drag-to-close";
import type { PublicModifierGroup, PublicProduct } from "@/server/menu/public-menu";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { MostOrderedCard } from "./most-ordered-card";
import { ProductPhoto } from "./product-photo";

/** Picks the starting selection for a group: its default modifier(s) if any
 * are marked `isDefault`, otherwise the first modifier for a required
 * single-select group (has to start somewhere), otherwise nothing. */
function initialSelection(group: PublicModifierGroup): Set<string> {
  const defaults = group.modifiers.filter((m) => m.isDefault).slice(0, group.maxSelect);
  if (defaults.length > 0) return new Set(defaults.map((m) => m.id));
  if (group.isRequired && group.maxSelect === 1 && group.modifiers.length > 0) {
    return new Set([group.modifiers[0]!.id]);
  }
  return new Set();
}

function initialSelectionsFor(product: PublicProduct): Record<string, Set<string>> {
  const initial: Record<string, Set<string>> = {};
  for (const group of product.modifierGroups) {
    initial[group.id] = initialSelection(group);
  }
  return initial;
}

function groupSatisfied(group: PublicModifierGroup, count: number): boolean {
  if (group.isRequired && count === 0) return false;
  if (count > 0 && count < group.minSelect) return false;
  if (count > group.maxSelect) return false;
  return true;
}

/** Waits two frames instead of one before starting a CSS transition.
 * A single requestAnimationFrame is the textbook pattern for "let the
 * browser paint the closed state, then flip to open so the transition
 * actually animates" — but it's not fully reliable under real-world paint
 * timing (e.g. an image still decoding). When that single frame gets
 * coalesced with the state flip, the sheet just snaps open with no
 * animation instead of sliding in — which is exactly what made tapping a
 * product's photo feel different from tapping its name: an image mid-
 * decode was more likely to cost the timing than plain text. Two frames
 * is the standard, more robust fix. */
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

const CROSSFADE_MS = 150;
const CLOSE_MS = 200;

export function ProductDetailSheet({
  product,
  allProducts,
  popularProductIds,
  onClose,
  onSelectProduct,
}: {
  product: PublicProduct | null;
  /** Whole catalog + Most Ordered ranking — needed for "Often bought
   * with" at the bottom (src/lib/cart/recommendations.ts). */
  allProducts: PublicProduct[];
  popularProductIds: ReadonlySet<string>;
  onClose: () => void;
  /** Tapping a recommendation swaps this same sheet to that product
   * (no close/reopen) — see the call site in menu-browser.tsx. */
  onSelectProduct: (product: PublicProduct) => void;
}) {
  const { addLine, cart } = useCart();
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  // What's actually rendered. Deliberately a step behind `product` during
  // a same-sheet swap (tapping an "Often bought with" card) — see the
  // effect below — so the old content can fade out before the new
  // content fades in, instead of jump-cutting.
  const [displayedProduct, setDisplayedProduct] = useState<PublicProduct | null>(null);
  // Whole-sheet open/close: backdrop opacity + panel slide.
  const [visible, setVisible] = useState(false);
  // Just the photo+details crossfade for a same-sheet product swap —
  // independent of `visible`, which only handles opening/closing.
  const [contentVisible, setContentVisible] = useState(true);
  // The scrollable content div is the same DOM node across a swap (the
  // sheet never remounts), so it keeps whatever scroll position it had
  // for the PREVIOUS product — without resetting it, swapping to a new
  // product from partway down "Often bought with" landed you partway
  // down the new product's content too, instead of at the photo.
  const contentRef = useRef<HTMLDivElement>(null);

  function showProduct(next: PublicProduct) {
    setDisplayedProduct(next);
    setSelections(initialSelectionsFor(next));
    setQuantity(1);
    setNotes("");
    setContentVisible(true);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }

  // Every branch below that leaves the sheet open ensures `visible` is
  // true, not just the "fresh open" one. That's the fix for a real bug:
  // close this product, then immediately open another (or the same one
  // again) before the 200ms close animation finishes, and `product` goes
  // null-then-non-null while `displayedProduct` is still set — landing on
  // the "swap" branch below. The old code only set `visible` on fresh
  // opens, so it stayed stuck `false`: the backdrop was invisible but
  // still mounted and still capturing every tap (nothing behind it was
  // clickable, and the page couldn't scroll) until a second tap forced a
  // real close. Fast repeat tapping — which nothing throttles when a
  // product has no photo to load — made this easy to trigger.
  useEffect(() => {
    if (!product) {
      // Closing: slide the sheet away, but keep rendering the last
      // product until the animation finishes rather than going blank.
      if (displayedProduct) {
        setVisible(false);
        const t = setTimeout(() => setDisplayedProduct(null), CLOSE_MS);
        return () => clearTimeout(t);
      }
      return;
    }

    if (!displayedProduct) {
      // TRUE fresh mount — the panel doesn't exist in the DOM yet this
      // render, so the browser needs to actually paint the "closed"
      // starting position at least once before we flip to open, or the
      // transition can get skipped entirely (mount + immediate style
      // flip coalesced into one paint — the double-frame wait is the
      // more reliable fix for that; see nextFrame's doc comment).
      showProduct(product);
      return nextFrame(() => setVisible(true));
    }

    // From here on the panel is already mounted and already painted at
    // least once — no frame-wait needed, `setVisible(true)` can happen
    // synchronously and the CSS transition still animates correctly.
    // This matters: it's what makes reopening (or swapping to a
    // different product) actually reliable after tapping close and then
    // immediately tapping something else, before the 200ms close
    // animation had finished — see the comment above this effect.
    setVisible(true);

    if (displayedProduct.id === product.id) {
      showProduct(product);
      return;
    }

    // Swapping to a different product while already open.
    setContentVisible(false);
    const t = setTimeout(() => showProduct(product), CROSSFADE_MS);
    return () => clearTimeout(t);
  }, [product, displayedProduct]);

  useEffect(() => {
    if (!displayedProduct) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleClose is stable; only care about open/closed, not which product
  }, [displayedProduct !== null]);

  const allSelectedModifiers = useMemo(() => {
    if (!displayedProduct) return [];
    return displayedProduct.modifierGroups.flatMap((group) =>
      group.modifiers.filter((m) => selections[group.id]?.has(m.id)),
    );
  }, [displayedProduct, selections]);

  const unitPriceCents =
    (displayedProduct?.priceCents ?? 0) + allSelectedModifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);

  const allGroupsSatisfied =
    displayedProduct?.modifierGroups.every((group) => groupSatisfied(group, selections[group.id]?.size ?? 0)) ??
    false;

  const recommendations = useMemo(
    () =>
      displayedProduct
        ? getProductPageRecommendations(displayedProduct, cart, allProducts, popularProductIds)
        : [],
    [displayedProduct, cart, allProducts, popularProductIds],
  );

  function handleClose() {
    onClose();
  }

  const {
    offset: dragOffset,
    dragging,
    settling,
    headerRef: dragHeaderRef,
    contentRef: dragContentRef,
  } = useDragToClose("y", handleClose);

  function toggleModifier(group: PublicModifierGroup, modifierId: string) {
    setSelections((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (group.maxSelect === 1) {
        // Single-select: clicking the already-selected option clears it
        // only when the group is optional; a required single-select
        // always keeps exactly one chosen.
        if (current.has(modifierId) && !group.isRequired) {
          current.clear();
        } else {
          current.clear();
          current.add(modifierId);
        }
      } else {
        if (current.has(modifierId)) {
          current.delete(modifierId);
        } else if (current.size < group.maxSelect) {
          current.add(modifierId);
        }
      }
      return { ...prev, [group.id]: current };
    });
  }

  function handleAddToCart() {
    if (!displayedProduct || !allGroupsSatisfied) return;
    addLine({
      productId: displayedProduct.id,
      categoryId: displayedProduct.categoryId,
      name: displayedProduct.name,
      menuNumber: displayedProduct.menuNumber,
      imageUrl: displayedProduct.imageUrl,
      unitPriceCents,
      quantity,
      notes: notes.trim(),
      modifiers: allSelectedModifiers.map((m) => ({
        modifierId: m.id,
        groupId: displayedProduct.modifierGroups.find((g) => g.modifiers.some((x) => x.id === m.id))!.id,
        name: m.name,
        priceDeltaCents: m.priceDeltaCents,
      })),
    });
    handleClose();
  }

  if (!displayedProduct) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex items-end justify-center bg-hg-ink/50 transition-opacity duration-200 sm:items-center sm:p-4",
        visible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={displayedProduct.name}
        onClick={(e) => e.stopPropagation()}
        style={dragging ? { transform: `translateY(${dragOffset}px)` } : undefined}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white sm:max-w-lg sm:rounded-2xl",
          (settling || !dragging) && "transition-transform duration-200",
          !dragging && (visible ? "translate-y-0" : "translate-y-full sm:translate-y-4 sm:opacity-0"),
        )}
      >
        {/* The photo itself is one swipe-down-to-close zone. The other is
            the scrollable content below, via dragContentRef — that one
            only claims the gesture once scrolled to the top, so a normal
            scroll through the modifier list is never mistaken for a
            close. */}
        <div className="relative shrink-0" ref={dragHeaderRef}>
          <div
            className={cn(
              "transition-all duration-150 ease-out",
              contentVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <ProductPhoto
              src={displayedProduct.imageUrl}
              alt={displayedProduct.imageAlt ?? displayedProduct.name}
              className="h-52 w-full sm:h-64"
            />
          </div>
          {/* Kept outside the crossfade — closing should never depend on
              a transition having settled. */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-hg-ink shadow-sm hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={mergeRefs(contentRef, dragContentRef)}
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain px-5 py-4 transition-all duration-150 ease-out",
            contentVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <div className="flex items-baseline gap-2">
            {displayedProduct.menuNumber !== null && (
              <span className="text-sm font-semibold text-hg-red">#{displayedProduct.menuNumber}</span>
            )}
            <h2 className="font-display text-xl font-semibold text-hg-ink">{displayedProduct.name}</h2>
          </div>
          {displayedProduct.description && (
            <p className="mt-1.5 text-sm text-hg-brown/80">{displayedProduct.description}</p>
          )}
          <p className="mt-2 text-base font-semibold text-hg-ink">{formatCents(displayedProduct.priceCents)}</p>
          {displayedProduct.containsAlcohol && (
            <p className="mt-2 rounded-md bg-hg-gold/15 px-3 py-2 text-xs text-hg-brown">
              Age-restricted — available for collection only, not delivery.
            </p>
          )}

          {displayedProduct.modifierGroups.map((group) => {
            const count = selections[group.id]?.size ?? 0;
            return (
              <fieldset key={group.id} className="mt-5 border-t border-hg-brown/10 pt-4">
                <legend className="flex w-full items-center justify-between gap-2 pb-2 text-sm font-semibold text-hg-ink">
                  <span>{group.name}</span>
                  <span className="text-xs font-normal text-hg-brown/60">
                    {group.isRequired
                      ? group.maxSelect === 1
                        ? "Choose 1"
                        : `Choose ${group.minSelect}–${group.maxSelect}`
                      : `Optional · up to ${group.maxSelect}`}
                  </span>
                </legend>
                {group.description && <p className="mb-2 text-xs text-hg-brown/60">{group.description}</p>}
                <div className="space-y-1.5">
                  {group.modifiers.map((modifier) => {
                    const isSelected = selections[group.id]?.has(modifier.id) ?? false;
                    const disabled = !isSelected && group.maxSelect > 1 && count >= group.maxSelect;
                    return (
                      <label
                        key={modifier.id}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors",
                          isSelected
                            ? "border-hg-red bg-hg-red/5"
                            : "border-hg-brown/15 hover:bg-hg-bg",
                          disabled && "cursor-not-allowed opacity-40",
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          <input
                            type={group.maxSelect === 1 ? "radio" : "checkbox"}
                            name={group.id}
                            checked={isSelected}
                            disabled={disabled}
                            onChange={() => toggleModifier(group, modifier.id)}
                            className="h-4 w-4 accent-hg-red"
                          />
                          <span className="text-hg-ink">{modifier.name}</span>
                        </span>
                        {modifier.priceDeltaCents !== 0 && (
                          <span className="shrink-0 text-hg-brown/70">
                            {modifier.priceDeltaCents > 0 ? "+" : ""}
                            {formatCents(modifier.priceDeltaCents)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div className="mt-5 border-t border-hg-brown/10 pt-4">
            <label htmlFor="notes" className="mb-1.5 block text-sm font-semibold text-hg-ink">
              Notes <span className="font-normal text-hg-brown/50">(optional)</span>
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. no coriander, extra spicy"
              maxLength={200}
              className="w-full rounded-lg border border-hg-brown/20 px-3 py-2 text-sm text-hg-ink placeholder:text-hg-brown/40 focus:border-hg-red focus:outline-none"
            />
          </div>

          {recommendations.length > 0 && (
            <div className="mt-5 border-t border-hg-brown/10 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-hg-ink">Often bought with</h3>
              <div className="grid grid-cols-2 gap-3">
                {recommendations.map((rec) => (
                  <MostOrderedCard key={rec.id} product={rec} onSelect={onSelectProduct} className="w-full" />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-hg-brown/10 bg-white px-5 py-4">
          <QuantityStepper value={quantity} onChange={setQuantity} />
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!allGroupsSatisfied}
            className="flex flex-1 items-center justify-between rounded-full bg-hg-red px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-hg-red/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>Add to cart</span>
            <span>{formatCents(unitPriceCents * quantity)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
