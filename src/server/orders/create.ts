/**
 * Turns a priced cart into a real, persisted `Order` + a Stripe
 * PaymentIntent — the one place a checkout attempt becomes a row in the
 * database. Guest checkout only (no `Customer` row, no accounts — that's
 * Phase 8); `fulfilmentType` is always `"PICKUP"` here, never taken from
 * the caller, because delivery doesn't exist yet (Phase 4).
 *
 * Two-phase by necessity: the DB write happens in one transaction, and the
 * Stripe call happens AFTER that transaction commits. Stripe calls must
 * never sit inside a Prisma transaction — there's no rollback semantics
 * for an external HTTP call, and it would hold a DB connection open across
 * a network round trip for no benefit.
 */

import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { getAvailability } from "@/server/menu/availability";
import { buildAvailabilityConfig } from "@/server/settings/get-opening-hours";
import { getSettings } from "@/server/settings/get-settings";
import { loadPricingContext } from "@/server/pricing/load-context";
import { priceOrder, type CartLineInput } from "@/server/pricing/order-total";
import { checkoutGate } from "@/server/orders/checkout-gate";
import { createUniqueOrderNumber } from "@/server/orders/order-number";
import { assertTransition } from "@/server/orders/state-machine";
import { recordAuditLog } from "@/server/audit/log";
import { stripe } from "@/server/payments/stripe/client";

export type CreateOrderInput = {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
  cartLines: CartLineInput[];
};

export type CreateOrderResult =
  | { ok: true; clientSecret: string; publicToken: string }
  | { ok: false; reason: string };

export async function createPickupOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  const [availability, settings, pricingContext] = await Promise.all([
    getAvailability(new Date(), await buildAvailabilityConfig()),
    getSettings(),
    loadPricingContext("PICKUP"),
  ]);

  const priced = priceOrder(input.cartLines, pricingContext);

  const gate = checkoutGate(availability, settings.pickupEnabled, priced);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!priced.ok) return { ok: false, reason: priced.errors[0]?.message ?? "Your order couldn't be priced." };

  const idempotencyKey = randomUUID();

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await createUniqueOrderNumber(tx);

    return tx.order.create({
      data: {
        orderNumber,
        publicToken: randomUUID(),
        status: "PENDING_PAYMENT",
        fulfilmentType: "PICKUP",
        customerId: null,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail ?? null,
        notes: input.notes ?? null,
        subtotalCents: priced.subtotalCents,
        discountCents: priced.discountCents,
        customerDeliveryFeeCents: 0,
        woltCostCents: 0,
        subsidyCents: 0,
        vatTotalCents: priced.vatTotalCents,
        totalCents: priced.foodTotalCents,
        items: {
          create: priced.lines.map((line) => ({
            productId: line.productId,
            menuNumber: line.menuNumber,
            nameSnapshot: line.nameSnapshot,
            unitPriceCents: line.unitPriceCents,
            quantity: line.quantity,
            lineTotalCents: line.lineTotalCents,
            vatRateBps: line.vatRateBps,
            notes: line.notes ?? null,
            modifiers: {
              create: line.modifiers.map((m) => ({
                modifierId: m.modifierId,
                nameSnapshot: m.nameSnapshot,
                priceDeltaCents: m.priceDeltaCents,
              })),
            },
          })),
        },
        payment: {
          create: {
            status: "REQUIRES_PAYMENT",
            idempotencyKey,
          },
        },
        events: {
          create: {
            fromStatus: null,
            toStatus: "PENDING_PAYMENT",
            actorType: "SYSTEM",
          },
        },
      },
      include: { payment: true },
    });
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: order.totalCents,
        currency: "eur",
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: order.id, orderNumber: order.orderNumber },
      },
      { idempotencyKey },
    );

    if (!paymentIntent.client_secret) {
      throw new Error("Stripe did not return a client secret.");
    }

    await prisma.payment.update({
      where: { orderId: order.id },
      data: {
        providerPaymentIntentId: paymentIntent.id,
        status: "PROCESSING",
        raw: paymentIntent as unknown as object,
      },
    });

    return { ok: true, clientSecret: paymentIntent.client_secret, publicToken: order.publicToken };
  } catch (err) {
    // The order exists but has no PaymentIntent behind it — mark both
    // terminal rather than leaving a PENDING_PAYMENT order nothing can
    // ever complete. The order number/public token are simply never
    // reused; the customer retries checkout fresh from Step 1.
    assertTransition("PENDING_PAYMENT", "FAILED", { fulfilmentType: "PICKUP", actorType: "SYSTEM" });

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: "FAILED" },
      }),
      prisma.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: "PENDING_PAYMENT",
          toStatus: "FAILED",
          actorType: "SYSTEM",
          reason: "Stripe PaymentIntent creation failed.",
        },
      }),
      prisma.payment.update({
        where: { orderId: order.id },
        data: {
          status: "FAILED",
          failureMessage: err instanceof Error ? err.message : "Unknown Stripe error.",
        },
      }),
    ]);

    await recordAuditLog({
      actorType: "SYSTEM",
      action: "ORDER_PAYMENT_SETUP_FAILED",
      entityType: "Order",
      entityId: order.id,
      after: { error: err instanceof Error ? err.message : String(err) },
    });

    return { ok: false, reason: "We couldn't set up payment for your order. Please try again." };
  }
}
