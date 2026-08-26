/**
 * Rejection email, sent once — from `src/server/orders/reject.ts`, right
 * after staff Reject an order. The counterpart to
 * `order-confirmation-email.ts`: a customer who paid and got no further
 * word would have no idea their order didn't go ahead, since the payment
 * hold simply vanishes from their statement a few days later with no
 * explanation. Same best-effort, never-throws contract as the
 * confirmation email — a failed send must never turn a successful Reject
 * into an error shown to staff.
 *
 * Deliberately does NOT include the staff-entered `rejectionReason` —
 * that field is internal (the kitchen-board UI itself labels it "shown
 * in our records, not to the customer"), free text staff type in a
 * hurry, not vetted for customer-facing wording. The email stays
 * generic and reassuring instead.
 *
 * Same retry-via-job-queue treatment as the confirmation email — see the
 * doc comment on `sendOrderConfirmationEmail` in
 * `order-confirmation-email.ts` for why the throwing/non-throwing split
 * exists.
 */

import { prisma } from "@/server/db";
import { resend } from "@/server/notifications/resend-client";
import { getSettings } from "@/server/settings/get-settings";
import { recordAuditLog } from "@/server/audit/log";
import { escapeHtml } from "@/lib/html-escape";
import { enqueueJob } from "@/server/jobs/enqueue";
import { logger, err } from "@/server/logging/logger";

function buildEmailHtml(input: { restaurantName: string; phone: string; orderNumber: string }): string {
  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#141313;">
    <h1 style="font-size:20px;">About your order ${escapeHtml(input.orderNumber)}</h1>
    <p>We're really sorry — we're not able to prepare this order right now.</p>
    <p><strong>You have not been charged.</strong> The hold on your card has been released; depending on your bank, it can take a few days to disappear from your statement, but no money has been taken.</p>
    <p>If you'd like to know more, or place a new order, give us a call on ${escapeHtml(input.phone)}.</p>
    <p style="margin-top:20px;color:#6b6157;">— ${escapeHtml(input.restaurantName)}</p>
  </div>`;
}

/**
 * Does the real work; throws on any failure instead of swallowing it.
 * Exported only for `src/server/jobs/handlers.ts` — every other call
 * site should use `sendOrderRejectionEmail` below instead.
 */
export async function sendOrderRejectionEmailOrThrow(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.customerEmail) return;

  const settings = await getSettings();
  const html = buildEmailHtml({
    restaurantName: settings.restaurantName,
    phone: settings.phone,
    orderNumber: order.orderNumber,
  });

  const fromAddress = process.env.EMAIL_FROM ?? "orders@hatgaocy.com";
  const result = await resend.emails.send({
    from: `${settings.restaurantName} <${fromAddress}>`,
    to: order.customerEmail,
    subject: `About your order ${order.orderNumber} — ${settings.restaurantName}`,
    html,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  await recordAuditLog({
    actorType: "SYSTEM",
    action: "ORDER_REJECTION_EMAIL_SENT",
    entityType: "Order",
    entityId: order.id,
    after: { to: order.customerEmail, resendId: result.data?.id },
  });
}

export async function sendOrderRejectionEmail(orderId: string): Promise<void> {
  try {
    await sendOrderRejectionEmailOrThrow(orderId);
  } catch (caught) {
    logger.error("Order rejection email failed", { orderId, error: err(caught) });
    await recordAuditLog({
      actorType: "SYSTEM",
      action: "ORDER_REJECTION_EMAIL_FAILED",
      entityType: "Order",
      entityId: orderId,
      after: { error: caught instanceof Error ? caught.message : String(caught) },
    });
    await enqueueJob("SEND_ORDER_REJECTION_EMAIL", { orderId });
  }
}
