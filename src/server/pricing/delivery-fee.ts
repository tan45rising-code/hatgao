/**
 * Delivery pricing engine.
 *
 * Two numbers always exist and must never be confused:
 *
 *   woltCostCents          — what Wolt Drive charges Hat Gao
 *   customerDeliveryFee    — what the customer is asked to pay
 *
 * The difference is the subsidy. Every order records all three, because the
 * only question that matters commercially is whether a direct order nets
 * more than the same order through the marketplace.
 *
 * Rules are configurable from the admin dashboard and are NOT hardcoded —
 * Wolt may change Hat Gao's costs on 15 days' notice (Agreement §3.2).
 */

import type { Cents } from "@/lib/money";

export type DeliveryPricingRuleType =
  | "FLAT_FEE"
  | "PASS_THROUGH"
  | "CAPPED_PASS_THROUGH"
  | "FREE_ABOVE_THRESHOLD"
  | "TIERED_BY_ORDER_VALUE"
  | "DISTANCE_GUARD";

export type DeliveryPricingRule =
  | { type: "FLAT_FEE"; priority: number; feeCents: Cents }
  | { type: "PASS_THROUGH"; priority: number }
  | { type: "CAPPED_PASS_THROUGH"; priority: number; capCents: Cents }
  | { type: "FREE_ABOVE_THRESHOLD"; priority: number; thresholdCents: Cents }
  | {
      type: "TIERED_BY_ORDER_VALUE";
      priority: number;
      /** Ordered bands. First band whose minSubtotalCents is met wins. */
      tiers: Array<{ minSubtotalCents: Cents; feeCents: Cents }>;
    }
  | { type: "DISTANCE_GUARD"; priority: number; maxWoltCostCents: Cents };

export type DeliveryQuoteInput = {
  /** Food subtotal after discounts, in cents. */
  subtotalCents: Cents;
  /** What Wolt quoted us for this delivery, in cents. */
  woltCostCents: Cents;
  rules: DeliveryPricingRule[];
};

export type DeliveryQuote =
  | {
      available: true;
      customerFeeCents: Cents;
      woltCostCents: Cents;
      /** Positive = Hat Gao absorbs. Negative = Hat Gao profits on delivery. */
      subsidyCents: Cents;
      appliedRule: DeliveryPricingRuleType;
    }
  | {
      available: false;
      reason: "EXCEEDS_COST_GUARD";
      woltCostCents: Cents;
      maxWoltCostCents: Cents;
    };

/**
 * Compute what the customer pays for delivery.
 *
 * Evaluation order:
 *   1. Guard rules run first and can refuse the delivery outright.
 *   2. Fee rules then run in priority order; the FIRST one that applies wins.
 *
 * "Applies" is rule-specific: FREE_ABOVE_THRESHOLD only applies when the
 * subtotal actually clears its threshold, so it can sit above a fallback
 * rule and cleanly fall through to it.
 *
 * If no rule applies at all, the customer pays Wolt's full cost. That's the
 * safe default — it can never silently lose money.
 */
export function quoteDeliveryFee(input: DeliveryQuoteInput): DeliveryQuote {
  const { subtotalCents, woltCostCents } = input;
  const sorted = [...input.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    if (rule.type === "DISTANCE_GUARD" && woltCostCents > rule.maxWoltCostCents) {
      return {
        available: false,
        reason: "EXCEEDS_COST_GUARD",
        woltCostCents,
        maxWoltCostCents: rule.maxWoltCostCents,
      };
    }
  }

  for (const rule of sorted) {
    let fee: Cents | null = null;

    switch (rule.type) {
      case "DISTANCE_GUARD":
        continue; // already handled
      case "FLAT_FEE":
        fee = rule.feeCents;
        break;
      case "PASS_THROUGH":
        fee = woltCostCents;
        break;
      case "CAPPED_PASS_THROUGH":
        fee = Math.min(woltCostCents, rule.capCents);
        break;
      case "FREE_ABOVE_THRESHOLD":
        // Only applies once the threshold is cleared; otherwise fall through.
        if (subtotalCents >= rule.thresholdCents) fee = 0;
        break;
      case "TIERED_BY_ORDER_VALUE": {
        const tier = [...rule.tiers]
          .sort((a, b) => b.minSubtotalCents - a.minSubtotalCents)
          .find((t) => subtotalCents >= t.minSubtotalCents);
        if (tier) fee = tier.feeCents;
        break;
      }
    }

    if (fee !== null) {
      const clamped = Math.max(0, fee);
      return {
        available: true,
        customerFeeCents: clamped,
        woltCostCents,
        subsidyCents: woltCostCents - clamped,
        appliedRule: rule.type,
      };
    }
  }

  return {
    available: true,
    customerFeeCents: woltCostCents,
    woltCostCents,
    subsidyCents: 0,
    appliedRule: "PASS_THROUGH",
  };
}

/**
 * Reproduce Wolt Drive's own fee schedule from the signed Agreement.
 *
 *   €3.50 base covers the first 1,000 m (straight-line)
 *   €0.50 per further 1,000 m increment
 *   EACH STARTED INCREMENT IS CHARGED IN FULL — 1,050 m costs €4.00, not €3.53
 *   Maximum 10,000 m
 *
 * This is used for the admin pricing simulator and for sanity-checking
 * Wolt's quote. Wolt's actual quoted price always wins at runtime; this is
 * a model, not a substitute.
 */
export type WoltFeeConfig = {
  baseFeeCents: Cents;
  baseDistanceMetres: number;
  incrementFeeCents: Cents;
  incrementMetres: number;
  maxDistanceMetres: number;
};

export const DEFAULT_WOLT_FEE_CONFIG: WoltFeeConfig = {
  baseFeeCents: 350,
  baseDistanceMetres: 1000,
  incrementFeeCents: 50,
  incrementMetres: 1000,
  maxDistanceMetres: 10000,
};

export function estimateWoltCost(
  distanceMetres: number,
  config: WoltFeeConfig = DEFAULT_WOLT_FEE_CONFIG,
): { withinRange: true; costCents: Cents } | { withinRange: false; maxMetres: number } {
  if (distanceMetres < 0) throw new Error("distance cannot be negative");
  if (distanceMetres > config.maxDistanceMetres) {
    return { withinRange: false, maxMetres: config.maxDistanceMetres };
  }
  const increments = Math.max(
    0,
    Math.ceil(distanceMetres / config.incrementMetres) - 1,
  );
  return {
    withinRange: true,
    costCents: config.baseFeeCents + increments * config.incrementFeeCents,
  };
}

/**
 * Straight-line (great-circle) distance in metres.
 *
 * The Agreement measures delivery distance as "the straight-line distance
 * between the relevant venue location and the applicable User's drop-off
 * location" — so this matches how Hat Gao is actually billed, and lets the
 * pricing simulator work without calling Wolt.
 */
export function straightLineMetres(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const R = 6371000; // Earth's mean radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
