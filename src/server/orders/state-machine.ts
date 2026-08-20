/**
 * Order state machine.
 *
 * Every legal transition is declared here, once. Anything not in this map
 * throws. That closes off an entire category of bug where some route handler
 * quietly sets a status it shouldn't — the kind that leaves an order stuck
 * in a state the kitchen never sees.
 */

export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PLACED"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "AWAITING_PICKUP"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED"
  | "ABANDONED"
  | "FAILED";

export type FulfilmentType = "DELIVERY" | "PICKUP";
export type ActorType = "CUSTOMER" | "STAFF" | "SYSTEM" | "STRIPE" | "WOLT";

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "ABANDONED"],
  PENDING_PAYMENT: ["PLACED", "ABANDONED", "FAILED"],
  // PLACED is only ever reached from a signature-verified Stripe webhook,
  // never from the browser claiming it paid.
  PLACED: ["ACCEPTED", "REJECTED", "CANCELLED", "FAILED"],
  ACCEPTED: ["PREPARING", "READY", "CANCELLED", "FAILED"],
  PREPARING: ["READY", "CANCELLED", "FAILED"],
  READY: ["OUT_FOR_DELIVERY", "AWAITING_PICKUP", "COMPLETED", "CANCELLED", "FAILED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "FAILED"],
  AWAITING_PICKUP: ["COMPLETED", "CANCELLED", "FAILED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
  ABANDONED: [],
  FAILED: [],
} as const;

export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
  "ABANDONED",
  "FAILED",
];

/** Statuses the kitchen tablet should be shouting about. */
export const NEEDS_STAFF_ACTION: readonly OrderStatus[] = ["PLACED"];

/** Statuses where the customer's money is at stake but no food is coming yet. */
export const AWAITING_RESOLUTION: readonly OrderStatus[] = ["PLACED", "ACCEPTED"];

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export type TransitionContext = {
  fulfilmentType: FulfilmentType;
  actorType: ActorType;
};

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
    reason?: string,
  ) {
    super(reason ?? `Cannot move an order from ${from} to ${to}.`);
    this.name = "InvalidTransitionError";
  }
}

/**
 * Validate a transition. Throws rather than returning false, because a
 * caller that ignores a boolean is exactly the failure mode this exists
 * to prevent.
 */
export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  ctx: TransitionContext,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }

  // A pickup order never goes out for delivery, and a delivery order is
  // never awaiting collection. Same map, different valid paths.
  if (to === "OUT_FOR_DELIVERY" && ctx.fulfilmentType !== "DELIVERY") {
    throw new InvalidTransitionError(from, to, "A collection order cannot go out for delivery.");
  }
  if (to === "AWAITING_PICKUP" && ctx.fulfilmentType !== "PICKUP") {
    throw new InvalidTransitionError(from, to, "A delivery order cannot await collection.");
  }

  // Only Stripe's webhook may declare an order paid.
  if (to === "PLACED" && ctx.actorType !== "STRIPE" && ctx.actorType !== "SYSTEM") {
    throw new InvalidTransitionError(
      from,
      to,
      "An order can only be marked as placed by a verified payment webhook.",
    );
  }

  // Accept/reject is a human decision.
  if ((to === "ACCEPTED" || to === "REJECTED") && ctx.actorType !== "STAFF" && ctx.actorType !== "SYSTEM") {
    throw new InvalidTransitionError(from, to, "Only restaurant staff can accept or reject an order.");
  }
}

/** The next status after READY, which depends on how the order is fulfilled. */
export function statusAfterReady(fulfilmentType: FulfilmentType): OrderStatus {
  return fulfilmentType === "DELIVERY" ? "OUT_FOR_DELIVERY" : "AWAITING_PICKUP";
}

/**
 * Whether cancelling now would incur Wolt's €3.00 Cancellation Fee.
 * The admin UI must warn staff with the amount before they confirm —
 * they should know they're spending Hat Gao's money.
 */
export function cancellationIncursWoltFee(
  status: OrderStatus,
  fulfilmentType: FulfilmentType,
  deliveryCreated: boolean,
): boolean {
  if (fulfilmentType !== "DELIVERY") return false;
  if (!deliveryCreated) return false;
  return !isTerminal(status);
}
