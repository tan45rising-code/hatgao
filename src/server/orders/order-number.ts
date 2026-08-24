/**
 * Short human code staff read aloud: "HG-4821" (`Order.orderNumber`,
 * `@unique`). A 4-digit random suffix collides rarely enough that a
 * bounded retry-on-conflict is simpler and safer than a sequence table —
 * the `@unique` constraint is what actually guarantees no duplicate ever
 * gets used, this is just "don't hand out one that's obviously taken."
 */

import type { Prisma } from "@prisma/client";

export function randomOrderNumber(): string {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `HG-${suffix}`;
}

const MAX_ATTEMPTS = 8;

/**
 * Finds an `orderNumber` not currently in use, inside the same transaction
 * that will go on to use it — checked with a plain `findUnique` rather than
 * relying on catching a `P2002` from the `Order` create, because the create
 * also writes items/payment in the same call and a caught unique-violation
 * there would be ambiguous about which column collided.
 */
export async function createUniqueOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = randomOrderNumber();
    const existing = await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique order number after several attempts.");
}
