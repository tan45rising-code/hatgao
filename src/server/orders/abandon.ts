/**
 * Customer-initiated abandonment: they went back from the payment step to
 * change something (name/phone/notes, or the cart itself) after an
 * `Order`+`PaymentIntent` already existed. Without this, "go back and
 * edit" would either be impossible, or would silently orphan the first
 * order at `PENDING_PAYMENT` forever every time someone used it — this is
 * what makes going back a real, clean action instead of just leaving a
 * mess for a second attempt to walk away from.
 *
 * Safe to call on an order that already moved on (e.g. the payment
 * actually succeeded in the background right as they clicked "back") —
 * returns the order's real current status instead of forcing ABANDONED,
 * so the caller can redirect to the status page instead of confusingly
 * reopening a form for an order that's already been placed.
 */

import { prisma } from "@/server/db";
import { assertTransition, type OrderStatus } from "@/server/orders/state-machine";
import { recordAuditLog } from "@/server/audit/log";
import { stripe } from "@/server/payments/stripe/client";

export type AbandonOrderResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; error: string };

export async function abandonOrder(publicToken: string): Promise<AbandonOrderResult> {
  const order = await prisma.order.findUnique({
    where: { publicToken },
    include: { payment: true },
  });

  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "PENDING_PAYMENT") {
    // Already moved on — nothing to abandon. Not an error: the caller
    // (checkout-wizard.tsx) uses this to decide whether to reopen the
    // details form or send them to the status page instead.
    return { ok: true, status: order.status as OrderStatus };
  }

  if (order.payment?.providerPaymentIntentId) {
    try {
      await stripe.paymentIntents.cancel(order.payment.providerPaymentIntentId);
    } catch (err) {
      // Already canceled, already succeeded, or a transient Stripe error —
      // none of these should block abandoning our own record. Audited,
      // not thrown: this must never turn "go back to edit" into an error
      // shown to the customer.
      await recordAuditLog({
        actorType: "CUSTOMER",
        action: "ORDER_ABANDON_CANCEL_FAILED",
        entityType: "Order",
        entityId: order.id,
        after: { error: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  assertTransition("PENDING_PAYMENT", "ABANDONED", {
    fulfilmentType: order.fulfilmentType,
    actorType: "CUSTOMER",
  });

  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { status: "ABANDONED" } }),
    ...(order.payment
      ? [
          prisma.payment.update({
            where: { id: order.payment.id },
            data: { status: "VOIDED", voidedAt: new Date() },
          }),
          prisma.paymentEvent.create({
            data: {
              paymentId: order.payment.id,
              type: "cancel",
              fromStatus: order.payment.status,
              toStatus: "VOIDED",
            },
          }),
        ]
      : []),
    prisma.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "ABANDONED",
        actorType: "CUSTOMER",
        reason: "Customer went back to edit checkout details.",
      },
    }),
  ]);

  await recordAuditLog({
    actorType: "CUSTOMER",
    action: "ORDER_ABANDONED",
    entityType: "Order",
    entityId: order.id,
  });

  return { ok: true, status: "ABANDONED" };
}
