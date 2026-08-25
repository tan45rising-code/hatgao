"use client";

/**
 * The one reliable place to clear the cart after checkout. It used to
 * happen client-side in checkout-wizard.tsx right after Step 1 — but that
 * component is long gone by the time payment actually succeeds: Stripe's
 * post-payment redirect (checkout-payment-form.tsx's `confirmPayment`,
 * default `redirect: "always"`) is a full top-level browser navigation,
 * not a client-side transition, so there's no "on success" callback to
 * hook client-side from within the wizard itself.
 *
 * `redirect_status=succeeded` in the query string is Stripe's own signal
 * that this is genuinely that redirect having just happened — as opposed
 * to a customer revisiting an old order's status link days later (from
 * the confirmation email, say), which must NOT clear whatever new cart
 * they might currently be building.
 */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/lib/cart/cart-context";

export function ClearCartOnPaymentSuccess() {
  const searchParams = useSearchParams();
  const { clear } = useCart();

  useEffect(() => {
    if (searchParams.get("redirect_status") === "succeeded") {
      clear();
    }
    // Deliberately once, on mount only — this fires from a fresh full
    // page load either way, so there's no meaningful "later" re-check to
    // do, and clear() isn't guaranteed referentially stable across
    // renders (see cart-context.tsx) so it doesn't belong in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
