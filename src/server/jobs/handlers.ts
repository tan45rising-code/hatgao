/**
 * Maps each `JobType` to the function that actually does the work.
 * Every handler here is expected to throw on failure — that's how
 * `process-jobs.ts` knows an attempt failed and should be retried or
 * given up on. Handlers are the *OrThrow variants of otherwise
 * best-effort functions; see `order-confirmation-email.ts` for why that
 * split exists.
 */

import { sendOrderConfirmationEmailOrThrow } from "@/server/notifications/order-confirmation-email";
import { sendOrderRejectionEmailOrThrow } from "@/server/notifications/order-rejection-email";
import type { JobPayloads, JobType } from "@/server/jobs/types";

type JobHandler<T extends JobType> = (payload: JobPayloads[T]) => Promise<void>;

export const jobHandlers: { [T in JobType]: JobHandler<T> } = {
  SEND_ORDER_CONFIRMATION_EMAIL: ({ orderId }) => sendOrderConfirmationEmailOrThrow(orderId),
  SEND_ORDER_REJECTION_EMAIL: ({ orderId }) => sendOrderRejectionEmailOrThrow(orderId),
};
