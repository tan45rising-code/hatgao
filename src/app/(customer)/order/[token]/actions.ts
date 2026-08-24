"use server";

/**
 * Public — no auth, matching the page itself (the unguessable
 * `publicToken` is the security boundary, not a session, per H.3).
 * Backs `OrderStatusLive`'s polling; deliberately returns only what the
 * live status line needs, not the full order (the receipt/collection
 * details don't change after checkout, so the page's own initial
 * Server Component fetch is the only place that reads them).
 */

import { prisma } from "@/server/db";
import { orderStatusCopy } from "@/server/orders/status-copy";
import type { OrderStatus } from "@/server/orders/state-machine";

export type OrderStatusSnapshot = {
  status: OrderStatus;
  statusCopy: string;
} | null;

export async function getOrderStatusSnapshotAction(token: string): Promise<OrderStatusSnapshot> {
  const order = await prisma.order.findUnique({
    where: { publicToken: token },
    select: { status: true },
  });

  if (!order) return null;

  const status = order.status as OrderStatus;
  return { status, statusCopy: orderStatusCopy(status) };
}
