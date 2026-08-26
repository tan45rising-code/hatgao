/**
 * Job type registry.
 *
 * One entry per background job the system knows how to run. Keeping the
 * type name and its payload shape together here means adding a new job
 * type touches exactly one place, and `handlers.ts` can't compile against
 * a payload shape that's drifted from what `enqueue.ts` actually writes.
 */

export type JobType = "SEND_ORDER_CONFIRMATION_EMAIL" | "SEND_ORDER_REJECTION_EMAIL";

export type JobPayloads = {
  SEND_ORDER_CONFIRMATION_EMAIL: { orderId: string };
  SEND_ORDER_REJECTION_EMAIL: { orderId: string };
};
