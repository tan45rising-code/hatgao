/**
 * Whether a checkout attempt is allowed to proceed right now, and if not,
 * why. Pure — no I/O — so it's unit-testable without a database or Stripe:
 * `src/server/orders/create.ts` does the actual `getAvailability()` call
 * and `priceOrder()` call, then hands both results in here to decide.
 *
 * One clear reason wins rather than the caller re-deriving priority order
 * itself. Availability is checked before pricing: no point telling someone
 * their order doesn't meet the minimum if the kitchen isn't even open.
 */

import type { ServiceAvailability } from "@/server/menu/availability";
import type { PricingResult } from "@/server/pricing/order-total";

export type CheckoutGateResult = { ok: true } | { ok: false; reason: string };

const AVAILABILITY_MESSAGES: Record<NonNullable<ServiceAvailability["reason"]>, string> = {
  CLOSED_TODAY: "We're closed today.",
  BEFORE_OPENING: "We're not open yet.",
  AFTER_CLOSING: "We're closed for the day.",
  TOO_CLOSE_TO_CLOSING: "We've stopped taking orders for tonight.",
  SERVICE_DISABLED: "We're not taking orders online right now.",
};

export function checkoutGate(
  availability: ServiceAvailability,
  pickupEnabled: boolean,
  pricing: PricingResult,
): CheckoutGateResult {
  if (!availability.acceptingOrders) {
    const reason = availability.reason ? AVAILABILITY_MESSAGES[availability.reason] : "We're not accepting orders right now.";
    return { ok: false, reason };
  }

  if (!pickupEnabled) {
    return { ok: false, reason: "Collection isn't available right now." };
  }

  if (!pricing.ok) {
    return { ok: false, reason: pricing.errors[0]?.message ?? "Your order couldn't be priced." };
  }

  return { ok: true };
}
