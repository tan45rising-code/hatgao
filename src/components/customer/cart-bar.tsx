"use client";

import { formatCents } from "@/lib/money";
import { useCart } from "@/lib/cart/cart-context";
import { cartItemCount, cartTotalCents } from "@/lib/cart/types";

export function CartBar() {
  const { cart, openDrawer } = useCart();
  const count = cartItemCount(cart);

  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-6 sm:pb-6">
      <button
        type="button"
        onClick={openDrawer}
        className="mx-auto flex w-full max-w-lg items-center justify-between rounded-full bg-hg-red px-5 py-3.5 text-white shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-hg-red">
            {count}
          </span>
          View order
        </span>
        <span className="text-sm font-semibold">{formatCents(cartTotalCents(cart))}</span>
      </button>
    </div>
  );
}
