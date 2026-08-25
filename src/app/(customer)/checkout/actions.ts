"use server";

/**
 * Checkout Server Actions. These take a plain, JSON-serializable object
 * (not `FormData`) — `checkout-wizard.tsx` invokes them directly from
 * client state, not via a `<form action>` post, and Next.js Server
 * Actions support that natively.
 */

import { z } from "zod";
import { createPickupOrder } from "@/server/orders/create";
import { abandonOrder } from "@/server/orders/abandon";
import { loadPricingContext } from "@/server/pricing/load-context";
import { priceOrder, type CartLineInput } from "@/server/pricing/order-total";

const cartLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
  modifierIds: z.array(z.string()),
  notes: z.string().optional(),
});

const customerSchema = z.object({
  customerName: z.string().trim().min(1, "Name is required"),
  customerPhone: z.string().trim().min(1, "Phone number is required"),
  customerEmail: z.string().trim().email().optional().or(z.literal("")),
  notes: z.string().trim().optional(),
});

export type StartCheckoutResult =
  | { ok: true; clientSecret: string; publicToken: string }
  | { ok: false; reason: string };

export async function startCheckoutAction(input: {
  cartLines: CartLineInput[];
  customer: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    notes?: string;
  };
}): Promise<StartCheckoutResult> {
  const lines = z.array(cartLineSchema).safeParse(input.cartLines);
  const customer = customerSchema.safeParse(input.customer);

  if (!lines.success || lines.data.length === 0) {
    return { ok: false, reason: "Your cart is empty." };
  }
  if (!customer.success) {
    return { ok: false, reason: customer.error.issues[0]?.message ?? "Please check your details." };
  }

  return createPickupOrder({
    cartLines: lines.data,
    customerName: customer.data.customerName,
    customerPhone: customer.data.customerPhone,
    customerEmail: customer.data.customerEmail || undefined,
    notes: customer.data.notes || undefined,
  });
}

export type AbandonCheckoutResult = { ok: true; alreadyPlaced: boolean };

/** "Edit details" from the payment step — see abandon.ts for why this is
 * more than just resetting local component state: an Order + PaymentIntent
 * already exist by this point, and this properly cancels/marks that one
 * abandoned instead of leaving it orphaned every time someone uses this. */
export async function abandonCheckoutAction(publicToken: string): Promise<AbandonCheckoutResult> {
  const result = await abandonOrder(publicToken);
  // Not surfaced as an error even on abandonOrder's own { ok: false } —
  // whatever went wrong server-side, the customer's intent ("let me
  // change something") is still safely satisfiable by just resetting the
  // wizard to Step 1 and starting a fresh order on next submit.
  const alreadyPlaced = result.ok && result.status !== "ABANDONED";
  return { ok: true, alreadyPlaced };
}

export type PreviewResult =
  | { ok: true; subtotalCents: number; discountCents: number; totalCents: number }
  | { ok: false; errors: string[] };

/** Display-only live total for Step 1 — re-derives from the DB exactly
 * like `createPickupOrder` does, never trusts anything the client sends.
 * No DB writes happen here. */
export async function previewCartPricingAction(cartLines: CartLineInput[]): Promise<PreviewResult> {
  const parsed = z.array(cartLineSchema).safeParse(cartLines);
  if (!parsed.success || parsed.data.length === 0) {
    return { ok: false, errors: ["Your cart is empty."] };
  }

  const ctx = await loadPricingContext("PICKUP");
  const priced = priceOrder(parsed.data, ctx);

  if (!priced.ok) {
    return { ok: false, errors: priced.errors.map((e) => e.message) };
  }

  return {
    ok: true,
    subtotalCents: priced.subtotalCents,
    discountCents: priced.discountCents,
    totalCents: priced.foodTotalCents,
  };
}
