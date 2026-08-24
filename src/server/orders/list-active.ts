/**
 * Feeds the kitchen board — both its first paint (Server Component) and
 * its polling loop (Server Action) — so the two never drift into
 * different shapes.
 */

import { prisma } from "@/server/db";
import type { OrderStatus } from "@/server/orders/state-machine";

const ACTIVE_STATUSES: OrderStatus[] = ["PLACED", "ACCEPTED", "PREPARING", "READY", "AWAITING_PICKUP"];

export type KitchenOrderModifier = {
  name: string;
  priceDeltaCents: number;
};

export type KitchenOrderItem = {
  id: string;
  nameSnapshot: string;
  menuNumber: number | null;
  quantity: number;
  notes: string | null;
  modifiers: KitchenOrderModifier[];
};

export type KitchenOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  totalCents: number;
  createdAt: Date;
  promisedReadyAt: Date | null;
  items: KitchenOrderItem[];
};

export async function getActiveOrders(): Promise<KitchenOrderSummary[]> {
  const orders = await prisma.order.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    orderBy: { createdAt: "asc" },
    include: { items: { include: { modifiers: true } } },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status as OrderStatus,
    version: order.version,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    notes: order.notes,
    totalCents: order.totalCents,
    createdAt: order.createdAt,
    promisedReadyAt: order.promisedReadyAt,
    items: order.items.map((item) => ({
      id: item.id,
      nameSnapshot: item.nameSnapshot,
      menuNumber: item.menuNumber,
      quantity: item.quantity,
      notes: item.notes,
      modifiers: item.modifiers.map((m) => ({ name: m.nameSnapshot, priceDeltaCents: m.priceDeltaCents })),
    })),
  }));
}
