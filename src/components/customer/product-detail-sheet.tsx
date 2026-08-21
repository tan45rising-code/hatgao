"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart/cart-context";
import { getProductPageRecommendations } from "@/lib/cart/recommendations";
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
      // Fresh open.
      showProduct(product);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }

    if (displayedProduct.id !== product.id) {
      // Swapping to a different product while already open — e.g. tapping
      // an "Often bought with" card. Fade the old content out, then swap
      // and fade the new content in, rather than snapping straight over.
      setContentVisible(false);
      const t = setTimeout(() => showProduct(product), CROSSFADE_MS);
      return () => clearTimeout(t);
    }
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
        visible ? "opacity-100" : "opacity-0",
      )}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={displayedProduct.name}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white transition-transform duration-200 sm:max-w-lg sm:rounded-2xl",
          visible ? "translate-y-0" : "translate-y-full sm:translate-y-4 sm:opacity-0",
        )}
      >
        <div className="relative shrink-0">
          <div
            className={cn(
              "transition-all duration-150 ease-out",
              contentVisible ? "opacity-100" : "opacity-0",
            )}
          >
            <ProductPhoto
              src={displayedProduct.imageUrl}
              alt={displayedProduct.imageAlt ?? displayedProduct.name}
              className="h-44 w-full sm:h-56"
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
          ref={contentRef}
          className={cn(
            "flex-1 overflow-y-auto px-5 py-4 transition-all duration-150 ease-out",
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
