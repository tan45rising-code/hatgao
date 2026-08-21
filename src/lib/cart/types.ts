/**
 * The client-side cart's shape. Phase 2 only — nothing here is ever sent
 * to the server as-is. At checkout (Phase 3), the cart contents get
 * translated into `CartLineInput[]` (src/server/pricing/order-total.ts,
 * product/modifier IDs and quantity only) and re-priced from the database
 * from scratch. Everything else on a CartLine below (names, prices) is
 * for display only — it's a snapshot of what the server rendered at
 * add-to-cart time, so the cart still looks right even if a price changes
 * on the menu a minute later, but it is NEVER trusted for money math.
 */

export type CartLineModifier = {
  modifierId: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
};

export type CartLine = {
  /** Unique per distinct product+modifier-selection combination, so the
   * same dish added twice with different options doesn't merge. */
  lineId: string;
  productId: string;
  /** Needed by recommendations.ts to know which categories the cart
   * already covers — not shown anywhere in the cart UI itself. */
  categoryId: string;
  name: string;
  menuNumber: number | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  modifiers: CartLineModifier[];
  notes: string;
};

export type Cart = {
  lines: CartLine[];
};

export const EMPTY_CART: Cart = { lines: [] };

export function cartLineTotalCents(line: CartLine): number {
  return line.unitPriceCents * line.quantity;
}

export function cartTotalCents(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + cartLineTotalCents(line), 0);
}

export function cartItemCount(cart: Cart): number {
  return cart.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Deterministic id for a product+modifier-selection so identical
 * add-to-cart calls merge (bump quantity) instead of creating duplicate
 * lines, while a different modifier selection stays a separate line. */
export function buildLineId(productId: string, modifierIds: string[]): string {
  return `${productId}::${[...modifierIds].sort().join(",")}`;
}
