/**
 * Order confirmation email, sent once — from `webhook-handler.ts`, right
 * after the Stripe webhook that marks an order `PLACED` (the closest
 * thing this system has to "the order is placed successfully"; PLACED
 * only ever happens via a verified webhook, see state-machine.ts).
 *
 * Best-effort and non-blocking by design: a failed send must never break
 * the payment webhook it's called from, or cause Stripe to retry an
 * otherwise-successful webhook delivery. Every error is caught here,
 * logged, and audited — never thrown. `customerEmail` is optional at
 * checkout, so this is a no-op when there isn't one.
 */

import { prisma } from "@/server/db";
import { resend } from "@/server/notifications/resend-client";
import { getSettings } from "@/server/settings/get-settings";
import { recordAuditLog } from "@/server/audit/log";
import { formatCents } from "@/lib/money";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(input: {
  restaurantName: string;
  addressLine: string;
  city: string;
  phone: string;
  orderNumber: string;
  statusUrl: string;
  items: Array<{ nameSnapshot: string; quantity: number; lineTotalCents: number; modifierNames: string[] }>;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}): string {
  const rows = input.items
    .map((item) => {
      const modifiers = item.modifierNames.length
        ? `<div style="color:#6b6157;font-size:13px;">${escapeHtml(item.modifierNames.join(", "))}</div>`
        : "";
      return `
        <tr>
          <td style="padding:6px 0;">
            <div>${item.quantity}× ${escapeHtml(item.nameSnapshot)}</div>
            ${modifiers}
          </td>
          <td style="padding:6px 0;text-align:right;white-space:nowrap;">${formatCents(item.lineTotalCents)}</td>
        </tr>`;
    })
    .join("");

  const discountRow =
    input.discountCents > 0
      ? `<tr><td style="padding:4px 0;color:#6b6157;">Discount</td><td style="padding:4px 0;text-align:right;color:#6b6157;">-${formatCents(input.discountCents)}</td></tr>`
      : "";

  return `
  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#141313;">
    <h1 style="font-size:20px;">Order ${escapeHtml(input.orderNumber)} confirmed</h1>
    <p>Thanks for ordering from ${escapeHtml(input.restaurantName)} — we've got your order and the kitchen's on it.</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5ddd0;margin-top:8px;padding-top:8px;">
      <tr><td style="padding:4px 0;color:#6b6157;">Subtotal</td><td style="padding:4px 0;text-align:right;color:#6b6157;">${formatCents(input.subtotalCents)}</td></tr>
      ${discountRow}
      <tr><td style="padding:4px 0;font-weight:600;">Total</td><td style="padding:4px 0;text-align:right;font-weight:600;">${formatCents(input.totalCents)}</td></tr>
    </table>
    <p style="margin-top:20px;"><strong>Collection</strong><br>
      ${escapeHtml(input.restaurantName)}, ${escapeHtml(input.addressLine)}, ${escapeHtml(input.city)}<br>
      ${escapeHtml(input.phone)}
    </p>
    <p><a href="${input.statusUrl}" style="color:#c52d24;">Track your order status</a></p>
  </div>`;
}

export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { modifiers: true } } },
  });

  if (!order || !order.customerEmail) return;

  // Everything below is inside this one try, not just the send call —
  // the whole point of this function is that it NEVER throws (see the
  // doc comment above). A DB hiccup while building the email is exactly
  // as recoverable-only-by-logging as a Resend API error: the outer
  // webhook handler's early-return-on-redelivery guard means a thrown
  // error here would surface as a retried webhook that skips straight
  // past this function next time (state already applied) — silently
  // dropping the email forever instead of just failing loudly once.
  try {
    const settings = await getSettings();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const statusUrl = `${appUrl}/order/${order.publicToken}`;

    const html = buildEmailHtml({
      restaurantName: settings.restaurantName,
      addressLine: settings.addressLine,
      city: settings.city,
      phone: settings.phone,
      orderNumber: order.orderNumber,
      statusUrl,
      items: order.items.map((item) => ({
        nameSnapshot: item.nameSnapshot,
        quantity: item.quantity,
        lineTotalCents: item.lineTotalCents,
        modifierNames: item.modifiers.map((m) => m.nameSnapshot),
      })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
    });

    const fromAddress = process.env.EMAIL_FROM ?? "orders@hatgaocy.com";
    const result = await resend.emails.send({
      from: `${settings.restaurantName} <${fromAddress}>`,
      to: order.customerEmail,
      subject: `Order ${order.orderNumber} confirmed — ${settings.restaurantName}`,
      html,
    });

    if (result.error) {
      throw new Error(result.error.message);
    }

    await recordAuditLog({
      actorType: "SYSTEM",
      action: "ORDER_CONFIRMATION_EMAIL_SENT",
      entityType: "Order",
      entityId: order.id,
      after: { to: order.customerEmail, resendId: result.data?.id },
    });
  } catch (err) {
    // Never throw out of here — see the file-level doc comment. This is
    // the one place a failure is allowed to be silent to the customer
    // (they still have the on-screen confirmation page); it's not silent
    // to us, it's audited.
    console.error("Order confirmation email failed", order.orderNumber, err);
    await recordAuditLog({
      actorType: "SYSTEM",
      action: "ORDER_CONFIRMATION_EMAIL_FAILED",
      entityType: "Order",
      entityId: order.id,
      after: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}
