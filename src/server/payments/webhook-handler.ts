/**
 * Stripe webhook event processing — HTTP-free, per the
 * `src/app` may import `src/server`, never the reverse rule. The route
 * handler (`src/app/api/webhooks/stripe/route.ts`) verifies the signature
 * and handles the inbox row; this file only ever sees an already-trusted
 * `Stripe.Event`.
 *
 * Every branch re-checks the current DB state before writing — that's
 * what makes a safe reprocess of an incompletely-handled event (see the
 * route handler's idempotency comment) actually safe, and what makes a
 * genuine Stripe redelivery a no-op instead of a double-write.
 */

import type Stripe from "stripe";
import { prisma } from "@/server/db";
import { assertTransition } from "@/server/orders/state-machine";
import { recordAuditLog } from "@/server/audit/log";
import { sendOrderConfirmationEmail } from "@/server/notifications/order-confirmation-email";

async function findPaymentByIntentId(paymentIntentId: string) {
  return prisma.payment.findUnique({
    where: { providerPaymentIntentId: paymentIntentId },
    include: { order: true },
  });
}

async function handleAmountCapturableUpdated(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentByIntentId(pi.id);
  if (!payment) return; // stray/unrelated event — nothing to do, don't retry-loop it

  if (payment.status === "AUTHORIZED" && payment.order.status !== "PENDING_PAYMENT") {
    return; // already applied — safe no-op on redelivery
  }

  // Tracks whether THIS call is the one that actually moved the order to
  // PLACED — as opposed to a safe no-op reprocess where it got there
  // already. The confirmation email fires only on that genuine
  // transition, which is also what makes it idempotent for free: any
  // later redelivery of this event either short-circuits at the early
  // return above, or (payment already AUTHORIZED, order already PLACED)
  // never sets this flag, so the email never sends twice.
  let justPlaced = false;

  await prisma.$transaction(async (tx) => {
    if (payment.status !== "AUTHORIZED") {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "AUTHORIZED",
          amountAuthorizedCents: pi.amount_capturable || pi.amount,
          authorizedAt: new Date(),
          raw: pi as unknown as object,
        },
      });
      await tx.paymentEvent.create({
        data: {
          paymentId: payment.id,
          type: "payment_intent.amount_capturable_updated",
          fromStatus: payment.status,
          toStatus: "AUTHORIZED",
          raw: pi as unknown as object,
        },
      });
    }

    if (payment.order.status === "PENDING_PAYMENT") {
      assertTransition("PENDING_PAYMENT", "PLACED", {
        fulfilmentType: payment.order.fulfilmentType,
        actorType: "STRIPE",
      });
      await tx.order.update({ where: { id: payment.order.id }, data: { status: "PLACED" } });
      await tx.orderEvent.create({
        data: {
          orderId: payment.order.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "PLACED",
          actorType: "STRIPE",
        },
      });
      justPlaced = true;
    }
  });

  await recordAuditLog({
    actorType: "STRIPE",
    action: "PAYMENT_AUTHORIZED",
    entityType: "Order",
    entityId: payment.order.id,
    after: { paymentIntentId: pi.id },
  });

  // Outside the transaction and after it's committed — an external email
  // API call has no place inside a DB transaction (same reasoning as the
  // Stripe calls in create.ts/accept.ts), and a failure here must never
  // roll back or retry the payment state change. Best-effort by design;
  // see the file-level doc comment on sendOrderConfirmationEmail.
  if (justPlaced) {
    await sendOrderConfirmationEmail(payment.order.id);
  }
}

async function handlePaymentFailed(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentByIntentId(pi.id);
  if (!payment) return;
  if (payment.status === "FAILED") return; // already applied

  const failureCode = pi.last_payment_error?.code ?? null;
  const failureMessage = pi.last_payment_error?.message ?? null;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureCode, failureMessage, raw: pi as unknown as object },
    });
    await tx.paymentEvent.create({
      data: {
        paymentId: payment.id,
        type: "payment_intent.payment_failed",
        fromStatus: payment.status,
        toStatus: "FAILED",
        raw: pi as unknown as object,
      },
    });

    if (payment.order.status === "PENDING_PAYMENT") {
      assertTransition("PENDING_PAYMENT", "FAILED", {
        fulfilmentType: payment.order.fulfilmentType,
        actorType: "STRIPE",
      });
      await tx.order.update({ where: { id: payment.order.id }, data: { status: "FAILED" } });
      await tx.orderEvent.create({
        data: {
          orderId: payment.order.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "FAILED",
          actorType: "STRIPE",
          reason: failureMessage ?? undefined,
        },
      });
    }
  });

  await recordAuditLog({
    actorType: "STRIPE",
    action: "PAYMENT_FAILED",
    entityType: "Order",
    entityId: payment.order.id,
    after: { paymentIntentId: pi.id, failureCode, failureMessage },
  });
}

async function handleCanceled(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentByIntentId(pi.id);
  if (!payment) return;
  // Our own reject.ts cancels the PaymentIntent synchronously and already
  // sets VOIDED — this event usually arrives after that already happened.
  // Must be a safe no-op replay.
  if (payment.status === "VOIDED") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "VOIDED", voidedAt: new Date(), raw: pi as unknown as object },
  });
  await prisma.paymentEvent.create({
    data: {
      paymentId: payment.id,
      type: "payment_intent.canceled",
      fromStatus: payment.status,
      toStatus: "VOIDED",
      raw: pi as unknown as object,
    },
  });
}

export async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
      await handleAmountCapturableUpdated(event.data.object as Stripe.PaymentIntent);
      return;
    case "payment_intent.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      return;
    case "payment_intent.canceled":
      await handleCanceled(event.data.object as Stripe.PaymentIntent);
      return;
    default:
      // Notably `payment_intent.succeeded`, which fires after our own
      // manual capture in accept.ts — that call already updated the DB
      // synchronously and is authoritative. This is a documented no-op,
      // not a missing case.
      return;
  }
}
