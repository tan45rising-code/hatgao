/**
 * Kitchen-board status progression: ACCEPTED → PREPARING → READY →
 * AWAITING_PICKUP → COMPLETED. No Stripe involved (money already settled
 * at ACCEPTED) — just the order state machine plus the optimistic lock.
 */

import { prisma } from "@/server/db";
import { assertTransition, type OrderStatus } from "@/server/orders/state-machine";
import { recordAuditLog } from "@/server/audit/log";

export type AdvanceOrderStatusInput = {
  orderId: string;
  expectedVersion: number;
  to: OrderStatus;
  actorId: string;
};

export type AdvanceOrderStatusResult = { ok: true } | { ok: false; error: string };

export async function advanceOrderStatus(input: AdvanceOrderStatusInput): Promise<AdvanceOrderStatusResult> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order) return { ok: false, error: "Order not found." };

  if (order.version !== input.expectedVersion) {
    return { ok: false, error: "Someone else already updated this order." };
  }

  assertTransition(order.status, input.to, {
    fulfilmentType: order.fulfilmentType,
    actorType: "STAFF",
  });

  const now = new Date();
  const result = await prisma.order.updateMany({
    where: { id: order.id, version: input.expectedVersion },
    data: {
      status: input.to,
      version: { increment: 1 },
      ...(input.to === "READY" ? { readyAt: now } : {}),
      ...(input.to === "COMPLETED" ? { completedAt: now } : {}),
    },
  });

  if (result.count === 0) {
    return { ok: false, error: "Someone else already updated this order." };
  }

  await prisma.orderEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.to,
      actorType: "STAFF",
      actorId: input.actorId,
    },
  });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: input.actorId,
    action: `ORDER_STATUS_${input.to}`,
    entityType: "Order",
    entityId: order.id,
  });

  return { ok: true };
}
