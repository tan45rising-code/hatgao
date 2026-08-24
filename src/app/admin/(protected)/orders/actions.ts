"use server";

/**
 * Kitchen board actions. Unlike the classic form-post idiom in
 * `menu/products/actions.ts` (void return, outcome via `redirect()` +
 * query-string flags), these **return a result object**. That's a
 * deliberate deviation, not an inconsistency: the kitchen board is a
 * live, JS-driven, interval-polling client component, not a page that
 * navigates on submit — it needs the result in hand to show an inline
 * message and immediately re-poll, without a page navigation ever
 * happening.
 *
 * `requireStaff()` is the same shape as `requireOwner()` elsewhere
 * (session-existence check only) — role gating is `middleware.ts`'s job,
 * not this file's; `/admin/orders` has no OWNER requirement, so any
 * signed-in staff member reaches here.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { acceptOrder } from "@/server/orders/accept";
import { rejectOrder } from "@/server/orders/reject";
import { advanceOrderStatus } from "@/server/orders/advance-status";
import { getActiveOrders, type KitchenOrderSummary } from "@/server/orders/list-active";
import type { OrderStatus } from "@/server/orders/state-machine";

async function requireStaff() {
  const session = await auth();
  if (!session) redirect("/admin/login");
  return session;
}

export type KitchenActionResult = {
  ok: boolean;
  error?: string;
  orders: KitchenOrderSummary[];
};

async function withFreshOrders(action: () => Promise<{ ok: boolean; error?: string }>): Promise<KitchenActionResult> {
  const result = await action();
  revalidatePath("/admin/orders");
  const orders = await getActiveOrders();
  return { ok: result.ok, error: result.error, orders };
}

export async function pollActiveOrdersAction(): Promise<KitchenActionResult> {
  await requireStaff();
  const orders = await getActiveOrders();
  return { ok: true, orders };
}

export async function acceptOrderAction(orderId: string, expectedVersion: number): Promise<KitchenActionResult> {
  const session = await requireStaff();
  return withFreshOrders(() => acceptOrder({ orderId, expectedVersion, actorId: session.user.id }));
}

export async function rejectOrderAction(
  orderId: string,
  expectedVersion: number,
  reason: string,
): Promise<KitchenActionResult> {
  const session = await requireStaff();
  return withFreshOrders(() => rejectOrder({ orderId, expectedVersion, actorId: session.user.id, reason }));
}

export async function advanceOrderStatusAction(
  orderId: string,
  expectedVersion: number,
  to: OrderStatus,
): Promise<KitchenActionResult> {
  const session = await requireStaff();
  return withFreshOrders(() => advanceOrderStatus({ orderId, expectedVersion, to, actorId: session.user.id }));
}
