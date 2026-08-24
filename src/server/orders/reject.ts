/**
 * Staff rejecting an order. Cancels the Stripe authorization hold (no fee
 * — there's no Wolt delivery yet to cancel; that penalty only applies
 * from Phase 4 onward, and only after a delivery was actually created).
 */

import { prisma } from "@/server/db";
import { assertTransition } from "@/server/orders/state-machine";
import { recordAuditLog } from "@/server/audit/log";
import { stripe } from "@/server/payments/stripe/client";
import { sendOrderRejectionEmail } from "@/server/notifications/order-rejection-email";

export type RejectOrderInput = {
  orderId: string;
  expectedVersion: number;
  actorId: string;
  reason: string;
};

export type RejectOrderResult = { ok: true } | { ok: false; error: string };

export async function rejectOrder(input: RejectOrderInput): Promise<RejectOrderResult> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order || !order.payment) {
    return { ok: false, error: "Order not found." };
  }

  if (order.status !== "PLACED" || order.version !== input.expectedVersion) {
    return { ok: false, error: "Someone else already handled this order." };
  }

  if (!order.payment.providerPaymentIntentId) {
    return { ok: false, error: "This order has no payment to release." };
  }

  try {
    await stripe.paymentIntents.cancel(order.payment.providerPaymentIntentId);
  } catch (err) {
    await recordAuditLog({
      actorType: "STAFF",
      actorId: input.actorId,
      action: "ORDER_REJECT_CANCEL_FAILED",
      entityType: "Order",
      entityId: order.id,
      after: { error: err instanceof Error ? err.message : String(err) },
    });
    return { ok: false, error: "Payment could not be released. The order has not been rejected." };
  }

  assertTransition("PLACED", "REJECTED", { fulfilmentType: order.fulfilmentType, actorType: "STAFF" });
  const now = new Date();

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: {
        status: "REJECTED",
        version: { increment: 1 },
        rejectionReason: input.reason,
      },
    }),
    prisma.payment.update({
      where: { id: order.payment.id },
      data: { status: "VOIDED", voidedAt: now },
    }),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: "PLACED",
        toStatus: "REJECTED",
        actorType: "STAFF",
        actorId: input.actorId,
        reason: input.reason,
      },
    }),
    prisma.paymentEvent.create({
      data: {
        paymentId: order.payment.id,
        type: "cancel",
        fromStatus: order.payment.status,
        toStatus: "VOIDED",
      },
    }),
  ]);

  await recordAuditLog({
    actorType: "STAFF",
    actorId: input.actorId,
    action: "ORDER_REJECTED",
    entityType: "Order",
    entityId: order.id,
    after: { reason: input.reason },
  });

  // Best-effort/never-throws by design — a customer who paid deserves to
  // know their order didn't go ahead, but a failed send must not turn a
  // successful Reject (payment already released) into an error for staff.
  await sendOrderRejectionEmail(order.id);

  return { ok: true };
}
