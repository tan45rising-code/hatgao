/**
 * Staff accepting an order: the pivot where an authorized hold becomes
 * captured money. Capture happens FIRST (Stripe, synchronous), and the DB
 * only ever says `ACCEPTED` once that succeeds — so there's no window
 * where the database claims the order was accepted but the card was
 * never actually charged.
 */

import { prisma } from "@/server/db";
import { assertTransition } from "@/server/orders/state-machine";
import { suggestedPrepMinutes, DEFAULT_PEAK_WINDOWS } from "@/server/menu/availability";
import { getSettings } from "@/server/settings/get-settings";
import { recordAuditLog } from "@/server/audit/log";
import { stripe } from "@/server/payments/stripe/client";
import { sendOrderConfirmationEmail } from "@/server/notifications/order-confirmation-email";

export type AcceptOrderInput = {
  orderId: string;
  expectedVersion: number;
  actorId: string;
};

export type AcceptOrderResult =
  | { ok: true }
  | { ok: false; error: string };

export async function acceptOrder(input: AcceptOrderInput): Promise<AcceptOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order || !order.payment) {
    return { ok: false, error: "Order not found." };
  }

  // Cheap pre-check to avoid a wasted Stripe call on an obvious double-tap
  // (two staff tablets, or one staff member tapping twice). This is NOT
  // the safety net — Stripe's own PaymentIntent state is (a PI can only
  // be captured once) — it's just faster feedback for the common case.
  if (order.status !== "PLACED" || order.version !== input.expectedVersion) {
    return { ok: false, error: "Someone else already handled this order." };
  }

  if (!order.payment.providerPaymentIntentId) {
    return { ok: false, error: "This order has no payment to capture." };
  }

  let capturedAmount: number;
  try {
    const captured = await stripe.paymentIntents.capture(order.payment.providerPaymentIntentId);
    capturedAmount = captured.amount_received || captured.amount;
  } catch (err) {
    await prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: "CAPTURE_FAILED",
        failureMessage: err instanceof Error ? err.message : "Unknown Stripe error.",
      },
    });
    await recordAuditLog({
      actorType: "STAFF",
      actorId: input.actorId,
      action: "ORDER_ACCEPT_CAPTURE_FAILED",
      entityType: "Order",
      entityId: order.id,
      after: { error: err instanceof Error ? err.message : String(err) },
    });
    // Order.status is deliberately left at PLACED — staff can retry, or
    // investigate in the Stripe dashboard, rather than the order silently
    // sitting "accepted" with no money actually taken.
    return { ok: false, error: "Payment could not be captured. The order has not been accepted." };
  }

  // Stripe has now captured the money. The DB write below MUST land even
  // if `order.version` moved between the pre-check above and here — the
  // capture already happened; failing to record it would be worse than a
  // stale-version mismatch (money taken, order stuck at PLACED forever).
  // So this uses a plain `update` keyed only on `id`, not a versioned
  // `updateMany`, and reloads the row instead of trusting the stale copy.
  const settings = await getSettings();
  const now = new Date();
  const prepMinutes = suggestedPrepMinutes(now, {
    defaultPrepMinutes: settings.defaultPrepMinutes,
    peakPrepMinutes: settings.peakPrepMinutes,
    peakWindows: DEFAULT_PEAK_WINDOWS,
    timezone: settings.timezone,
  });
  const promisedReadyAt = new Date(now.getTime() + prepMinutes * 60_000);

  assertTransition("PLACED", "ACCEPTED", { fulfilmentType: order.fulfilmentType, actorType: "STAFF" });

  const fresh = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  if (fresh.status !== "PLACED") {
    // Extremely unlikely (Stripe only lets one capture succeed), but if
    // the order moved on some other way between the capture call and now,
    // still record the capture — never leave Payment: CAPTURED sitting
    // next to an order status the capture didn't get applied to.
    await recordAuditLog({
      actorType: "STAFF",
      actorId: input.actorId,
      action: "ORDER_ACCEPT_VERSION_MISMATCH_AFTER_CAPTURE",
      entityType: "Order",
      entityId: order.id,
      after: { expectedVersion: input.expectedVersion, actualStatus: fresh.status },
    });
  }

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "ACCEPTED",
        version: { increment: 1 },
        acceptedAt: now,
        promisedPrepMinutes: prepMinutes,
        promisedReadyAt,
      },
    }),
    prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: "CAPTURED",
        amountCapturedCents: capturedAmount,
        capturedAt: now,
      },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: fresh.status,
        toStatus: "ACCEPTED",
        actorType: "STAFF",
        actorId: input.actorId,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: order.payment.id,
        type: "capture",
        fromStatus: order.payment.status,
        toStatus: "CAPTURED",
      },
    }),
  ]);

  await recordAuditLog({
    actorType: "STAFF",
    actorId: input.actorId,
    action: "ORDER_ACCEPTED",
    entityType: "Order",
    entityId: order.id,
    after: { promisedPrepMinutes: prepMinutes },
  });

  // After everything above has durably landed — the confirmation email
  // is a side effect of a successful Accept, not a precondition for one.
  // Best-effort/never-throws by design, see the file's own doc comment.
  await sendOrderConfirmationEmail(order.id);

  return { ok: true };
}
