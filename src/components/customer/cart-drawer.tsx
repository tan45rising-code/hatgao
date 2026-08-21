"use client";

import { ShoppingBag, Trash2, X } from "lucide-react";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart/cart-context";
import { cartLineTotalCents, cartTotalCents } from "@/lib/cart/types";
import { QuantityStepper } from "@/components/ui/quantity-stepper";
import { ProductPhoto } from "./product-photo";

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, updateQuantity, removeLine } = useCart();
  const total = cartTotalCents(cart);

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
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-hg-bg shadow-xl transition-transform duration-200",
          isDrawerOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-hg-brown/10 bg-white px-5 py-4">
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
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <ShoppingBag className="h-10 w-10 text-hg-brown/30" strokeWidth={1.5} />
            <p className="text-sm text-hg-brown/60">Your cart is empty — add something tasty from the menu.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ul className="space-y-4">
                {cart.lines.map((line) => (
                  <li key={line.lineId} className="flex gap-3 rounded-xl bg-white p-3 shadow-sm">
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
                        <p className="mt-0.5 truncate text-xs italic text-hg-brown/50">&ldquo;{line.notes}&rdquo;</p>
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
                  </li>
                ))}
              </ul>
            </div>

            <div className="shrink-0 border-t border-hg-brown/10 bg-white px-5 py-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-hg-brown/70">Estimated total</span>
                <span className="text-base font-semibold text-hg-ink">{formatCents(total)}</span>
              </div>
              <p className="mb-3 rounded-md bg-hg-gold/15 px-3 py-2 text-center text-xs text-hg-brown">
                Checkout is on its way — you&apos;ll be able to pay and place this order soon.
              </p>
              <button
                type="button"
                onClick={closeDrawer}
                className="w-full rounded-full border border-hg-brown/20 bg-white px-5 py-2.5 text-sm font-semibold text-hg-ink transition-colors hover:bg-hg-bg"
              >
                Continue browsing
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
