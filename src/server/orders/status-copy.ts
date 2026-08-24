/**
 * Plain-language status text for the customer-facing confirmation page.
 * Exhaustive switch with a compiler-enforced `never` default arm, so
 * adding a new `OrderStatus` without updating this file fails
 * `npm run typecheck:domain` instead of silently rendering nothing.
 *
 * `PENDING_PAYMENT` gets deliberately reassuring copy, not an error look
 * — the customer's browser lands on `/order/[token]` immediately after
 * `stripe.confirmPayment()` resolves, which can be a few seconds before
 * the webhook has actually flipped the order to PLACED.
 */

import type { OrderStatus } from "@/server/orders/state-machine";

export function orderStatusCopy(status: OrderStatus): string {
  switch (status) {
    case "DRAFT":
      return "Building your order.";
    case "PENDING_PAYMENT":
      return "Confirming your payment…";
    case "PLACED":
      return "We've got your order and we're confirming it now.";
    case "ACCEPTED":
      return "Your order's confirmed — the kitchen's starting on it.";
    case "PREPARING":
      return "Your order is being prepared.";
    case "READY":
      return "Your order is ready!";
    case "OUT_FOR_DELIVERY":
      return "Your order is on its way.";
    case "AWAITING_PICKUP":
      return "Your order is ready for collection.";
    case "COMPLETED":
      return "Order complete. Thanks for ordering from Hat Gao!";
    case "REJECTED":
      return "We're sorry — we weren't able to take this order. Your payment hold has been released.";
    case "CANCELLED":
      return "This order was cancelled.";
    case "ABANDONED":
      return "This order was never completed.";
    case "FAILED":
      return "Something went wrong with this order. Please contact us or try ordering again.";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
