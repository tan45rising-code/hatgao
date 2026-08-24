/**
 * Stripe webhook receiver. Thin HTTP adapter — signature verification and
 * the `WebhookEvent` inbox row live here; the actual state transitions are
 * in `src/server/payments/webhook-handler.ts` (HTTP-free, per the
 * `src/app`/`src/server` import rule).
 *
 * `runtime = "nodejs"` because signature verification needs the raw,
 * unparsed request body and Node's crypto — the Edge runtime can't do
 * either the way the Stripe SDK expects.
 *
 * Idempotency is NOT "try to create, catch the unique-constraint
 * violation, return 200" — that would permanently swallow a redelivery of
 * an event whose *processing* genuinely failed partway (e.g. a transient
 * DB error after the row was written). Instead: attempt the create; on a
 * unique-constraint conflict, look up the existing row — a `PROCESSED`
 * row is a true duplicate delivery (no-op, 200); a `RECEIVED` or `FAILED`
 * row is a retry of an incomplete attempt (reprocess it). This is only
 * safe because every handler in `webhook-handler.ts` re-checks current DB
 * state before transitioning anything, so a safe reprocess really is safe.
 */

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { stripe } from "@/server/payments/stripe/client";
import { processStripeWebhookEvent } from "@/server/payments/webhook-handler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let webhookEventId: string;

  try {
    const created = await prisma.webhookEvent.create({
      data: {
        provider: "stripe",
        providerEventId: event.id,
        eventType: event.type,
        payload: event as unknown as Prisma.InputJsonValue,
        status: "RECEIVED",
      },
    });
    webhookEventId = created.id;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
      throw err;
    }

    const existing = await prisma.webhookEvent.findUnique({
      where: { provider_providerEventId: { provider: "stripe", providerEventId: event.id } },
    });

    if (existing?.status === "PROCESSED") {
      // A true duplicate delivery of an event we already finished.
      return NextResponse.json({ received: true, duplicate: true });
    }

    // A retry of an event whose earlier processing attempt didn't finish
    // (RECEIVED, never got to PROCESSED — or FAILED). Reprocess it.
    webhookEventId = existing!.id;
  }

  try {
    await processStripeWebhookEvent(event);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { status: "PROCESSED", processedAt: new Date(), attempts: { increment: 1 } },
    });
  } catch (err) {
    console.error("Stripe webhook processing failed", event.type, event.id, err);
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        attempts: { increment: 1 },
      },
    });
    // 500 so Stripe retries with backoff — the inbox row above ensures a
    // retry reprocesses rather than double-applying anything already done.
    return NextResponse.json({ error: "Processing failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
