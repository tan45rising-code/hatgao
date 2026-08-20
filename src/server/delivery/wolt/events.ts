/**
 * Wolt Drive webhook event handling.
 *
 * Wolt's own documentation states plainly that events "triggered by the same
 * action ... may be sent at seemingly random order."
 *
 * So we must never apply a webhook by blindly setting the status. Each state
 * gets a rank, and an incoming event only advances the delivery if it
 * outranks the current state. A late-arriving `order.pickup_started` cannot
 * drag a delivery back out of DELIVERED.
 *
 * Every event is still recorded in delivery_events regardless of whether it
 * advanced the state — nothing is lost, we just don't act on stale news.
 */

export type DeliveryStatus =
  | "NOT_REQUIRED"
  | "QUOTED"
  | "CREATION_PENDING"
  | "CREATION_FAILED"
  | "CREATED"
  | "PICKUP_STARTED"
  | "PICKED_UP"
  | "DROPOFF_STARTED"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED"
  | "CUSTOMER_NO_SHOW";

/**
 * Event types documented by Wolt. Auto-subscribed unless noted.
 * `order.location_updated` is deliberately NOT subscribed — Wolt's docs
 * warn it generates heavy load, and live courier position is a nicety,
 * not a V1 requirement.
 */
export const WOLT_EVENT_TYPES = [
  "order.received",
  "order.rejected",
  "order.pickup_eta_updated",
  "order.pickup_started",
  "order.picked_up",
  "order.pickup_arrival",
  "order.dropoff_started",
  "order.dropoff_arrival",
  "order.dropoff_completed",
  "order.delivered",
  "order.dropoff_eta_updated",
  "order.handshake_delivery",
  "order.customer_no_show", // optional subscription
] as const;

export type WoltEventType = (typeof WOLT_EVENT_TYPES)[number];

/**
 * Monotonic ranking of delivery progress. Higher = further along.
 * Terminal failure states rank high so they cannot be overwritten by a
 * late progress event.
 */
const STATUS_RANK: Record<DeliveryStatus, number> = {
  NOT_REQUIRED: 0,
  QUOTED: 10,
  CREATION_PENDING: 20,
  CREATED: 30,
  PICKUP_STARTED: 40,
  PICKED_UP: 50,
  DROPOFF_STARTED: 60,
  DELIVERED: 100,
  // Terminal failures — deliberately above every progress state.
  CREATION_FAILED: 100,
  CANCELLED: 100,
  REJECTED: 100,
  CUSTOMER_NO_SHOW: 100,
};

/** Events that move the delivery forward. Others are informational only. */
const EVENT_TO_STATUS: Partial<Record<WoltEventType, DeliveryStatus>> = {
  "order.received": "CREATED",
  "order.rejected": "REJECTED",
  "order.pickup_started": "PICKUP_STARTED",
  "order.picked_up": "PICKED_UP",
  "order.dropoff_started": "DROPOFF_STARTED",
  "order.dropoff_completed": "DELIVERED",
  "order.delivered": "DELIVERED",
  "order.customer_no_show": "CUSTOMER_NO_SHOW",
};

export function rankOf(status: DeliveryStatus): number {
  return STATUS_RANK[status];
}

export function statusForEvent(eventType: string): DeliveryStatus | null {
  return EVENT_TO_STATUS[eventType as WoltEventType] ?? null;
}

export type ApplyEventInput = {
  currentStatus: DeliveryStatus;
  eventType: string;
  /** ISO timestamp from the event payload. */
  dispatchedAt?: string | null;
  /** dispatchedAt of the event that last advanced this delivery. */
  lastDispatchedAt?: string | null;
};

export type ApplyEventResult =
  | { advance: true; nextStatus: DeliveryStatus; nextRank: number }
  | { advance: false; reason: "NOT_A_STATUS_EVENT" | "OUT_OF_ORDER" | "ALREADY_TERMINAL" };

/**
 * Decide whether an incoming webhook should move the delivery forward.
 *
 * Guards, in order:
 *   1. Informational events (ETA updates, arrivals) never change status.
 *   2. A delivery in a terminal state is not moved again.
 *   3. A lower-ranked event than the current state is stale — ignore it.
 *   4. Equal rank is allowed through only if the event is strictly newer,
 *      which lets `dropoff_completed` and `delivered` (both DELIVERED)
 *      behave sensibly without flapping.
 */
export function applyWoltEvent(input: ApplyEventInput): ApplyEventResult {
  const nextStatus = statusForEvent(input.eventType);
  if (!nextStatus) return { advance: false, reason: "NOT_A_STATUS_EVENT" };

  const currentRank = rankOf(input.currentStatus);
  const nextRank = rankOf(nextStatus);

  const isTerminalNow = currentRank >= 100;
  if (isTerminalNow && input.currentStatus !== nextStatus) {
    return { advance: false, reason: "ALREADY_TERMINAL" };
  }

  if (nextRank < currentRank) {
    return { advance: false, reason: "OUT_OF_ORDER" };
  }

  if (nextRank === currentRank) {
    const prev = input.lastDispatchedAt ? Date.parse(input.lastDispatchedAt) : null;
    const now = input.dispatchedAt ? Date.parse(input.dispatchedAt) : null;
    if (prev !== null && now !== null && now <= prev) {
      return { advance: false, reason: "OUT_OF_ORDER" };
    }
    if (input.currentStatus === nextStatus) {
      return { advance: false, reason: "OUT_OF_ORDER" };
    }
  }

  return { advance: true, nextStatus, nextRank };
}

/**
 * Wolt error codes, mapped to what the system should actually do.
 * Taken from Wolt's published error-handling documentation.
 */
export type WoltErrorAction =
  | "RETRY"
  | "REQUOTE_THEN_RETRY"
  | "BLOCK_DELIVERY_ADDRESS"
  | "DISABLE_DELIVERY_TEMPORARILY"
  | "ALERT_STAFF"
  | "TREAT_AS_SUCCESS";

export const WOLT_ERROR_ACTIONS: Record<string, WoltErrorAction> = {
  SHIPMENT_PROMISE_NOT_FOUND: "REQUOTE_THEN_RETRY",
  DROPOFF_OUTSIDE_OF_DELIVERY_AREA: "BLOCK_DELIVERY_ADDRESS",
  PICKUP_OUTSIDE_DELIVERY_AREA: "ALERT_STAFF",
  REQUEST_OUTSIDE_DELIVERY_HOURS: "DISABLE_DELIVERY_TEMPORARILY",
  DELIVERY_AREA_CLOSED: "DISABLE_DELIVERY_TEMPORARILY",
  DELIVERY_AREA_CLOSED_TEMPORARILY: "DISABLE_DELIVERY_TEMPORARILY",
  VENUE_CLOSED: "DISABLE_DELIVERY_TEMPORARILY",
  DUPLICATE_ORDER: "TREAT_AS_SUCCESS",
  GENERIC_INTERNAL_ERROR: "RETRY",
};

export function actionForWoltError(code: string | null | undefined): WoltErrorAction {
  if (!code) return "RETRY";
  return WOLT_ERROR_ACTIONS[code] ?? "ALERT_STAFF";
}

/**
 * Wolt's documented retry policy: retry 5xx with "maximum 5 retries per
 * request and, if possible, exponential back-off"; never retry 4xx, which
 * will just produce the same response. 429 is the exception — wait 5s to
 * 1 minute, then retry.
 *
 * `retriesSoFar` is the number of retries ALREADY MADE, not counting the
 * original request. So 0 means "the first attempt failed, may I retry?"
 * and 5 means five retries have already happened — stop.
 */
export const WOLT_MAX_RETRIES = 5;

export function shouldRetryHttpStatus(
  status: number,
  retriesSoFar: number,
): { retry: boolean; delayMs: number } {
  if (retriesSoFar >= WOLT_MAX_RETRIES) return { retry: false, delayMs: 0 };
  if (status === 429) {
    // Docs say wait 5 seconds to 1 minute. Ramp within that window.
    return { retry: true, delayMs: Math.min(5_000 * (retriesSoFar + 1), 60_000) };
  }
  if (status >= 500) {
    return { retry: true, delayMs: Math.min(1000 * 2 ** retriesSoFar, 60_000) };
  }
  return { retry: false, delayMs: 0 };
}
