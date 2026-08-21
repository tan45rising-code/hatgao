"use client";

import { ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart/cart-context";
import { cartItemCount } from "@/lib/cart/types";

/**
 * Text wordmark standing in for the real logo (public/logo.png or .svg)
 * until that file is supplied — see the request left in chat. Swap the
 * block below for an <img>/<Image> once it exists; everything else on
 * this header (layout, cart button) stays the same.
 */
export function SiteHeader() {
  const { cart, openDrawer } = useCart();
  const count = cartItemCount(cart);

  return (
    <header className="relative bg-hg-cream px-4 py-6 text-center sm:py-8">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open cart"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-hg-ink shadow-sm transition-colors hover:bg-white sm:right-6 sm:top-6"
      >
        <ShoppingBag className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-hg-red px-1 text-[11px] font-semibold text-white">
            {count}
          </span>
        )}
      </button>

      <p className="font-script text-5xl leading-none text-hg-red sm:text-6xl">Hat Gao</p>
      <p className="mt-1 text-xs font-semibold tracking-[0.25em] text-hg-ink sm:text-sm">
        VIETNAMESE RESTAURANT
      </p>
      <p className="mt-2 text-xs text-hg-brown/70 sm:text-sm">Nicosia, Cyprus</p>
    </header>
  );
}
