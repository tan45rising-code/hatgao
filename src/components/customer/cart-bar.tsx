"use client";

import { ShoppingBag } from "lucide-react";
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
          <ShoppingBag className="h-4 w-4" />
          {count} item{count === 1 ? "" : "s"} · View order
        </span>
        <span className="text-sm font-semibold">{formatCents(cartTotalCents(cart))}</span>
      </button>
    </div>
  );
}
