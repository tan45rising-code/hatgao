/**
 * Server-authoritative order totals.
 *
 * THE most important rule in the system: the browser sends product ids,
 * modifier ids and quantities. It NEVER sends prices. Everything here is
 * recomputed from database values at the moment of payment.
 *
 * Skipping this is how online shops get bought out at 90% off by someone
 * with browser devtools open.
 */

import { type Cents, percentageOf, vatFromGross } from "@/lib/money";

export type FulfilmentType = "DELIVERY" | "PICKUP";

/** A menu item as it exists in the database right now. */
export type PricedProduct = {
  id: string;
  menuNumber: number | null;
  name: string;
  priceCents: Cents;
  vatRateBps: number;
  isAvailable: boolean;
  isActive: boolean;
  deliveryEligible: boolean;
  pickupEligible: boolean;
  containsAlcohol: boolean;
};

export type PricedModifier = {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: Cents;
  isAvailable: boolean;
};

export type ModifierGroupRule = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
};

/** What the browser is allowed to tell us. Note: no prices. */
export type CartLineInput = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  notes?: string;
};

export type Discount =
  | { kind: "NONE" }
  | { kind: "PERCENTAGE"; bps: number; maxDiscountCents?: Cents }
  | { kind: "FIXED_AMOUNT"; amountCents: Cents }
  | { kind: "FREE_DELIVERY" };

export type PricingContext = {
  fulfilmentType: FulfilmentType;
  products: Map<string, PricedProduct>;
  modifiers: Map<string, PricedModifier>;
  groups: Map<string, ModifierGroupRule>;
  /** groupIds attached to each productId. */
  productGroups: Map<string, string[]>;
  discount?: Discount;
  minOrderCents: Cents;
};

export type PricedLine = {
  productId: string;
  menuNumber: number | null;
  nameSnapshot: string;
  unitPriceCents: Cents;
  quantity: number;
  lineTotalCents: Cents;
  vatRateBps: number;
  modifiers: Array<{ modifierId: string; nameSnapshot: string; priceDeltaCents: Cents }>;
  notes?: string;
};

export type PricingError = {
  code:
    | "PRODUCT_NOT_FOUND"
    | "PRODUCT_UNAVAILABLE"
    | "PRODUCT_NOT_ELIGIBLE_FOR_FULFILMENT"
    | "MODIFIER_NOT_FOUND"
    | "MODIFIER_UNAVAILABLE"
    | "MODIFIER_WRONG_PRODUCT"
    | "MODIFIER_GROUP_REQUIRED"
    | "MODIFIER_GROUP_TOO_FEW"
    | "MODIFIER_GROUP_TOO_MANY"
    | "INVALID_QUANTITY"
    | "EMPTY_CART"
    | "BELOW_MINIMUM_ORDER";
  message: string;
  productId?: string;
  groupId?: string;
};

export type PricingResult =
  | {
      ok: true;
      lines: PricedLine[];
      subtotalCents: Cents;
      discountCents: Cents;
      vatTotalCents: Cents;
      /** Food total after discount. Delivery fee is added separately. */
      foodTotalCents: Cents;
      freeDeliveryFromDiscount: boolean;
    }
  | { ok: false; errors: PricingError[] };

const MAX_QUANTITY_PER_LINE = 50;

export function priceOrder(
  lines: CartLineInput[],
  ctx: PricingContext,
): PricingResult {
  const errors: PricingError[] = [];

  if (lines.length === 0) {
    return {
      ok: false,
      errors: [{ code: "EMPTY_CART", message: "Your basket is empty." }],
    };
  }

  const priced: PricedLine[] = [];

  for (const line of lines) {
    const product = ctx.products.get(line.productId);

    if (!product) {
      errors.push({
        code: "PRODUCT_NOT_FOUND",
        message: "That item is no longer on the menu.",
        productId: line.productId,
      });
      continue;
    }

    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY_PER_LINE) {
      errors.push({
        code: "INVALID_QUANTITY",
        message: `Quantity must be between 1 and ${MAX_QUANTITY_PER_LINE}.`,
        productId: product.id,
      });
      continue;
    }

    if (!product.isActive || !product.isAvailable) {
      errors.push({
        code: "PRODUCT_UNAVAILABLE",
        message: `${product.name} is not available right now.`,
        productId: product.id,
      });
      continue;
    }

    // Beer on a delivery order lands here. The database also refuses it via
    // a CHECK constraint; this is the layer that produces a decent message.
    const eligible =
      ctx.fulfilmentType === "DELIVERY" ? product.deliveryEligible : product.pickupEligible;
    if (!eligible) {
      errors.push({
        code: "PRODUCT_NOT_ELIGIBLE_FOR_FULFILMENT",
        message:
          ctx.fulfilmentType === "DELIVERY" && product.containsAlcohol
            ? `${product.name} is available for collection only — we can't deliver alcohol.`
            : `${product.name} isn't available for ${ctx.fulfilmentType.toLowerCase()}.`,
        productId: product.id,
      });
      continue;
    }

    // ---- modifiers -------------------------------------------------------
    const allowedGroups = ctx.productGroups.get(product.id) ?? [];
    const chosen: PricedModifier[] = [];
    let modifierError = false;

    for (const modifierId of line.modifierIds) {
      const modifier = ctx.modifiers.get(modifierId);
      if (!modifier) {
        errors.push({
          code: "MODIFIER_NOT_FOUND",
          message: "One of the options you chose is no longer available.",
          productId: product.id,
        });
        modifierError = true;
        continue;
      }
      if (!allowedGroups.includes(modifier.groupId)) {
        errors.push({
          code: "MODIFIER_WRONG_PRODUCT",
          message: `"${modifier.name}" isn't an option for ${product.name}.`,
          productId: product.id,
        });
        modifierError = true;
        continue;
      }
      if (!modifier.isAvailable) {
        errors.push({
          code: "MODIFIER_UNAVAILABLE",
          message: `"${modifier.name}" has run out.`,
          productId: product.id,
        });
        modifierError = true;
        continue;
      }
      chosen.push(modifier);
    }

    // Validate each group's selection rules ("choose exactly one", etc).
    for (const groupId of allowedGroups) {
      const group = ctx.groups.get(groupId);
      if (!group) continue;
      const count = chosen.filter((m) => m.groupId === groupId).length;

      if (group.isRequired && count === 0) {
        errors.push({
          code: "MODIFIER_GROUP_REQUIRED",
          message: `Please choose an option for "${group.name}" on ${product.name}.`,
          productId: product.id,
          groupId,
        });
        modifierError = true;
      } else if (count > 0 && count < group.minSelect) {
        errors.push({
          code: "MODIFIER_GROUP_TOO_FEW",
          message: `Choose at least ${group.minSelect} for "${group.name}".`,
          productId: product.id,
          groupId,
        });
        modifierError = true;
      } else if (count > group.maxSelect) {
        errors.push({
          code: "MODIFIER_GROUP_TOO_MANY",
          message: `Choose no more than ${group.maxSelect} for "${group.name}".`,
          productId: product.id,
          groupId,
        });
        modifierError = true;
      }
    }

    if (modifierError) continue;

    const unitPrice =
      product.priceCents + chosen.reduce((sum, m) => sum + m.priceDeltaCents, 0);

    priced.push({
      productId: product.id,
      menuNumber: product.menuNumber,
      nameSnapshot: product.name,
      unitPriceCents: unitPrice,
      quantity: line.quantity,
      lineTotalCents: unitPrice * line.quantity,
      vatRateBps: product.vatRateBps,
      modifiers: chosen.map((m) => ({
        modifierId: m.id,
        nameSnapshot: m.name,
        priceDeltaCents: m.priceDeltaCents,
      })),
      ...(line.notes ? { notes: line.notes } : {}),
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const subtotalCents = priced.reduce((s, l) => s + l.lineTotalCents, 0);

  // ---- discount ----------------------------------------------------------
  const discount = ctx.discount ?? { kind: "NONE" };
  let discountCents = 0;
  let freeDeliveryFromDiscount = false;

  switch (discount.kind) {
    case "PERCENTAGE": {
      const raw = percentageOf(subtotalCents, discount.bps);
      discountCents = discount.maxDiscountCents
        ? Math.min(raw, discount.maxDiscountCents)
        : raw;
      break;
    }
    case "FIXED_AMOUNT":
      discountCents = Math.min(discount.amountCents, subtotalCents);
      break;
    case "FREE_DELIVERY":
      freeDeliveryFromDiscount = true;
      break;
    case "NONE":
      break;
  }

  const foodTotalCents = subtotalCents - discountCents;

  // Minimum order is checked against the food total AFTER discount —
  // otherwise a coupon could be used to slip under the threshold.
  if (foodTotalCents < ctx.minOrderCents) {
    return {
      ok: false,
      errors: [
        {
          code: "BELOW_MINIMUM_ORDER",
          message: `Minimum order for ${ctx.fulfilmentType.toLowerCase()} is €${(
            ctx.minOrderCents / 100
          ).toFixed(2)}.`,
        },
      ],
    };
  }

  // VAT is extracted per line at that line's own rate, then apportioned
  // against the discount. Mixed rates (5% food, 9% drinks, 19% beer) mean
  // a single blended rate would be wrong.
  const vatTotalCents = priced.reduce((sum, line) => {
    const share =
      subtotalCents === 0 ? 0 : Math.round((discountCents * line.lineTotalCents) / subtotalCents);
    return sum + vatFromGross(line.lineTotalCents - share, line.vatRateBps);
  }, 0);

  return {
    ok: true,
    lines: priced,
    subtotalCents,
    discountCents,
    vatTotalCents,
    foodTotalCents,
    freeDeliveryFromDiscount,
  };
}
