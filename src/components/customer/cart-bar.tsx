"use client";

import { usePathname } from "next/navigation";
import { formatCents } from "@/lib/money";
import { useCart } from "@/lib/cart/cart-context";
import { cartItemCount, cartTotalCents } from "@/lib/cart/types";

// `CartDrawer` only ever mounts on `/` (it renders from `MenuBrowser`,
// which needs the full product catalog for recommendations — see the
// note in layout.tsx). So on any other route, tapping this pill called
// `openDrawer()` into a void: it set `isDrawerOpen = true` in the cart
// context, but there was no drawer anywhere on the page to actually show
// — the pill just sat there looking clickable and doing nothing. Hiding
// it outright on routes with no drawer to open is simpler and more
// honest than trying to make it work somewhere it structurally can't.
const ROUTES_WITHOUT_DRAWER = ["/checkout", "/order"];

export function CartBar() {
  const { cart, openDrawer } = useCart();
  const pathname = usePathname();
  const count = cartItemCount(cart);

  if (count === 0) return null;
  if (ROUTES_WITHOUT_DRAWER.some((route) => pathname.startsWith(route))) return null;

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
