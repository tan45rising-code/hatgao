/**
 * Domain logic tests.
 *
 * Written as a plain runnable script rather than a Vitest suite, because the
 * sandbox cannot install packages yet. `npx tsx tests/unit/domain.test.ts`
 * runs them today; they convert to Vitest with a find-and-replace once npm
 * access returns.
 */

import assert from "node:assert/strict";

import {
  formatCents,
  grossFromNet,
  parsePriceToCents,
  percentageOf,
  vatFromGross,
  netFromGross,
} from "../../src/lib/money.ts";

import {
  DEFAULT_WOLT_FEE_CONFIG,
  estimateWoltCost,
  quoteDeliveryFee,
  straightLineMetres,
  type DeliveryPricingRule,
} from "../../src/server/pricing/delivery-fee.ts";

import {
  priceOrder,
  type PricingContext,
  type PricedProduct,
} from "../../src/server/pricing/order-total.ts";

import {
  assertTransition,
  canTransition,
  cancellationIncursWoltFee,
  InvalidTransitionError,
  isTerminal,
  ORDER_TRANSITIONS,
  statusAfterReady,
  type OrderStatus,
} from "../../src/server/orders/state-machine.ts";

import {
  actionForWoltError,
  applyWoltEvent,
  shouldRetryHttpStatus,
  WOLT_MAX_RETRIES,
} from "../../src/server/delivery/wolt/events.ts";

import {
  getAvailability,
  suggestedPrepMinutes,
  toLocalMoment,
  DEFAULT_PEAK_WINDOWS,
  type AvailabilityConfig,
  type OpeningHoursRow,
  type DayOfWeek,
} from "../../src/server/menu/availability.ts";

// ---------------------------------------------------------------- harness --
let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n      ${(err as Error).message.split("\n")[0]}`);
  }
}

function section(title: string) {
  console.log(`\n  ${title}`);
  console.log(`  ${"-".repeat(title.length)}`);
}

// ------------------------------------------------------------------ money --
section("Money and VAT");

test("VAT is extracted from a VAT-inclusive menu price", () => {
  // €8.50 Beef Pho at 5%: 850 × 500 / 10500 = 40.48 → 40 cents
  assert.equal(vatFromGross(850, 500), 40);
  assert.equal(netFromGross(850, 500), 810);
});

test("VAT extraction round-trips within a cent", () => {
  for (const gross of [100, 250, 750, 850, 900, 1000, 1950]) {
    for (const rate of [500, 900, 1900]) {
      const net = netFromGross(gross, rate);
      assert.ok(
        Math.abs(grossFromNet(net, rate) - gross) <= 1,
        `€${gross / 100} at ${rate / 100}% did not round-trip`,
      );
    }
  }
});

test("beer VAT differs from food VAT", () => {
  assert.equal(vatFromGross(200, 1900), 32); // €2.00 beer at 19%
  assert.equal(vatFromGross(200, 900), 17); // €2.00 soft drink at 9%
  assert.equal(vatFromGross(200, 500), 10); // hypothetical at 5%
});

test("non-integer cents are rejected", () => {
  assert.throws(() => vatFromGross(8.5, 500), /integer/);
});

test("percentage discount never exceeds the amount", () => {
  assert.equal(percentageOf(1000, 1000), 100); // 10% of €10
  assert.equal(percentageOf(1000, 20000), 1000); // 200% clamps to the total
});

test("prices format and parse consistently", () => {
  assert.equal(formatCents(850), "€8.50");
  assert.equal(formatCents(250), "€2.50");
  assert.equal(formatCents(100), "€1.00");
  assert.equal(formatCents(-50), "-€0.50");
  assert.equal(parsePriceToCents("8.50"), 850);
  assert.equal(parsePriceToCents("8,50"), 850); // European comma
  assert.equal(parsePriceToCents("€9"), 900);
  assert.equal(parsePriceToCents("7.5"), 750);
  assert.throws(() => parsePriceToCents("8.5.0"));
  assert.throws(() => parsePriceToCents("8.505"));
});

// ------------------------------------------------------- Wolt cost model --
section("Wolt Drive cost model (from the signed Agreement)");

test("fee table matches the contract exactly", () => {
  const expect: Array<[number, number]> = [
    [0, 350], [500, 350], [1000, 350],
    [1001, 400], [2000, 400],
    [2001, 450], [3000, 450],
    [4000, 500], [5000, 550], [6000, 600],
    [7000, 650], [8000, 700], [9000, 750], [10000, 800],
  ];
  for (const [metres, cents] of expect) {
    const r = estimateWoltCost(metres);
    assert.ok(r.withinRange, `${metres}m should be in range`);
    assert.equal(r.costCents, cents, `${metres}m should cost ${cents}c`);
  }
});

test("each STARTED increment is charged in full", () => {
  // The contract's wording. 1,050m is charged as two increments, not 1.05.
  const a = estimateWoltCost(1000);
  const b = estimateWoltCost(1001);
  assert.ok(a.withinRange && b.withinRange);
  assert.equal(b.costCents - a.costCents, 50);
});

test("beyond 10km is refused", () => {
  const r = estimateWoltCost(10001);
  assert.equal(r.withinRange, false);
});

test("straight-line distance is plausible for Nicosia", () => {
  // Hat Gao (approx) to a point ~2km away.
  const d = straightLineMetres({ lat: 35.1676, lon: 33.3644 }, { lat: 35.1856, lon: 33.3644 });
  assert.ok(d > 1900 && d < 2100, `expected ~2000m, got ${d}`);
});

// ----------------------------------------------------- delivery fee rules --
section("Delivery pricing rules");

const RULES: DeliveryPricingRule[] = [
  { type: "DISTANCE_GUARD", priority: 10, maxWoltCostCents: 800 },
  { type: "FREE_ABOVE_THRESHOLD", priority: 20, thresholdCents: 2500 },
  { type: "CAPPED_PASS_THROUGH", priority: 30, capCents: 400 },
];

test("free delivery applies above the threshold", () => {
  const q = quoteDeliveryFee({ subtotalCents: 3000, woltCostCents: 450, rules: RULES });
  assert.ok(q.available);
  assert.equal(q.customerFeeCents, 0);
  assert.equal(q.subsidyCents, 450); // Hat Gao absorbs the lot
  assert.equal(q.appliedRule, "FREE_ABOVE_THRESHOLD");
});

test("below the threshold, the cap applies and Hat Gao absorbs the rest", () => {
  const q = quoteDeliveryFee({ subtotalCents: 1900, woltCostCents: 450, rules: RULES });
  assert.ok(q.available);
  assert.equal(q.customerFeeCents, 400);
  assert.equal(q.subsidyCents, 50);
  assert.equal(q.appliedRule, "CAPPED_PASS_THROUGH");
});

test("a cheap nearby delivery is passed through under the cap", () => {
  const q = quoteDeliveryFee({ subtotalCents: 1600, woltCostCents: 350, rules: RULES });
  assert.ok(q.available);
  assert.equal(q.customerFeeCents, 350);
  assert.equal(q.subsidyCents, 0);
});

test("the cost guard refuses an uneconomic delivery", () => {
  const q = quoteDeliveryFee({ subtotalCents: 1600, woltCostCents: 850, rules: RULES });
  assert.equal(q.available, false);
  if (!q.available) assert.equal(q.reason, "EXCEEDS_COST_GUARD");
});

test("the guard fires even on a large order", () => {
  // A big basket must not buy its way past a structurally unprofitable trip.
  const q = quoteDeliveryFee({ subtotalCents: 9000, woltCostCents: 900, rules: RULES });
  assert.equal(q.available, false);
});

test("with no rules configured, the customer pays full cost (safe default)", () => {
  const q = quoteDeliveryFee({ subtotalCents: 2000, woltCostCents: 450, rules: [] });
  assert.ok(q.available);
  assert.equal(q.customerFeeCents, 450);
  assert.equal(q.subsidyCents, 0);
});

test("tiered pricing picks the right band", () => {
  const tiered: DeliveryPricingRule[] = [
    {
      type: "TIERED_BY_ORDER_VALUE",
      priority: 10,
      tiers: [
        { minSubtotalCents: 0, feeCents: 350 },
        { minSubtotalCents: 2000, feeCents: 200 },
        { minSubtotalCents: 3500, feeCents: 0 },
      ],
    },
  ];
  const at = (s: number) => {
    const q = quoteDeliveryFee({ subtotalCents: s, woltCostCents: 450, rules: tiered });
    assert.ok(q.available);
    return q.customerFeeCents;
  };
  assert.equal(at(1500), 350);
  assert.equal(at(2000), 200);
  assert.equal(at(3000), 200);
  assert.equal(at(3500), 0);
});

// ------------------------------------------------------------ order total --
section("Order pricing (server-authoritative)");

function makeProduct(over: Partial<PricedProduct> & { id: string }): PricedProduct {
  return {
    menuNumber: null,
    name: "Test",
    priceCents: 900,
    vatRateBps: 500,
    isAvailable: true,
    isActive: true,
    deliveryEligible: true,
    pickupEligible: true,
    containsAlcohol: false,
    ...over,
  };
}

const beefPho = makeProduct({ id: "p-025", menuNumber: 25, name: "Beef Pho", priceCents: 850 });
const coke = makeProduct({ id: "p-101", name: "Coca-Cola", priceCents: 200, vatRateBps: 900 });
const beer = makeProduct({
  id: "p-110", name: "Carlsberg Beer", priceCents: 200, vatRateBps: 1900,
  containsAlcohol: true, deliveryEligible: false,
});
const summerRolls = makeProduct({ id: "p-001", menuNumber: 1, name: "Summer Rolls", priceCents: 500 });

function ctx(over: Partial<PricingContext> = {}): PricingContext {
  return {
    fulfilmentType: "DELIVERY",
    products: new Map([
      [beefPho.id, beefPho], [coke.id, coke], [beer.id, beer], [summerRolls.id, summerRolls],
    ]),
    modifiers: new Map([
      ["mod-sr-chicken", { id: "mod-sr-chicken", groupId: "mg-sr", name: "Chicken", priceDeltaCents: 0, isAvailable: true }],
      ["mod-sr-duck", { id: "mod-sr-duck", groupId: "mg-sr", name: "Duck", priceDeltaCents: 100, isAvailable: true }],
      ["mod-beer-630", { id: "mod-beer-630", groupId: "mg-beer", name: "630ml", priceDeltaCents: 150, isAvailable: true }],
    ]),
    groups: new Map([
      ["mg-sr", { id: "mg-sr", name: "Choose your filling", minSelect: 1, maxSelect: 1, isRequired: true }],
      ["mg-beer", { id: "mg-beer", name: "Choose your size", minSelect: 1, maxSelect: 1, isRequired: true }],
    ]),
    productGroups: new Map([["p-001", ["mg-sr"]], ["p-110", ["mg-beer"]]]),
    minOrderCents: 1500,
    ...over,
  };
}

test("a realistic order prices correctly", () => {
  const r = priceOrder(
    [
      { productId: "p-025", quantity: 2, modifierIds: [] },
      { productId: "p-101", quantity: 1, modifierIds: [] },
    ],
    ctx(),
  );
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.errors));
  assert.equal(r.subtotalCents, 1900); // 2×850 + 200
  // Mixed VAT rates: 1700 @ 5% = 81, 200 @ 9% = 17
  assert.equal(r.vatTotalCents, 98);
  assert.equal(r.foodTotalCents, 1900);
});

test("BEER IS BLOCKED ON DELIVERY (Wolt Agreement §2.2-2.3)", () => {
  const r = priceOrder(
    [
      { productId: "p-025", quantity: 2, modifierIds: [] },
      { productId: "p-110", quantity: 1, modifierIds: ["mod-beer-630"] },
    ],
    ctx({ fulfilmentType: "DELIVERY" }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) {
    const e = r.errors.find((x) => x.code === "PRODUCT_NOT_ELIGIBLE_FOR_FULFILMENT");
    assert.ok(e, "expected an eligibility error");
    assert.match(e.message, /collection only/i);
  }
});

test("the same beer IS allowed on a pickup order", () => {
  const r = priceOrder(
    [
      { productId: "p-025", quantity: 2, modifierIds: [] },
      { productId: "p-110", quantity: 1, modifierIds: ["mod-beer-630"] },
    ],
    ctx({ fulfilmentType: "PICKUP" }),
  );
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.errors));
  assert.equal(r.subtotalCents, 1700 + 350); // beer €2.00 + €1.50 size delta
});

test("a required modifier group must be chosen", () => {
  const r = priceOrder([{ productId: "p-001", quantity: 4, modifierIds: [] }], ctx());
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "MODIFIER_GROUP_REQUIRED"));
});

test("modifier price deltas are applied", () => {
  const r = priceOrder(
    [{ productId: "p-001", quantity: 4, modifierIds: ["mod-sr-duck"] }],
    ctx(),
  );
  assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.errors));
  assert.equal(r.subtotalCents, 4 * 600); // €5.00 + €1.00 duck
});

test("a modifier from another product is rejected", () => {
  const r = priceOrder(
    [{ productId: "p-001", quantity: 4, modifierIds: ["mod-beer-630"] }],
    ctx(),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "MODIFIER_WRONG_PRODUCT"));
});

test("choosing two options where one is allowed is rejected", () => {
  const r = priceOrder(
    [{ productId: "p-001", quantity: 4, modifierIds: ["mod-sr-chicken", "mod-sr-duck"] }],
    ctx(),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "MODIFIER_GROUP_TOO_MANY"));
});

test("an unavailable (86'd) item is rejected", () => {
  const soldOut = makeProduct({ id: "p-025", name: "Beef Pho", priceCents: 850, isAvailable: false });
  const r = priceOrder(
    [{ productId: "p-025", quantity: 2, modifierIds: [] }],
    ctx({ products: new Map([["p-025", soldOut]]) }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "PRODUCT_UNAVAILABLE"));
});

test("the €15 delivery minimum is enforced", () => {
  const r = priceOrder([{ productId: "p-101", quantity: 2, modifierIds: [] }], ctx());
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "BELOW_MINIMUM_ORDER"));
});

test("a coupon cannot be used to slip under the minimum", () => {
  // €16 basket, 50% off → €8 food total, which is below the €15 minimum.
  const r = priceOrder(
    [{ productId: "p-025", quantity: 2, modifierIds: [] }],
    ctx({ discount: { kind: "PERCENTAGE", bps: 5000 } }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.errors.some((e) => e.code === "BELOW_MINIMUM_ORDER"));
});

test("a percentage discount reduces VAT proportionally", () => {
  const full = priceOrder([{ productId: "p-025", quantity: 3, modifierIds: [] }], ctx());
  const disc = priceOrder(
    [{ productId: "p-025", quantity: 3, modifierIds: [] }],
    ctx({ discount: { kind: "PERCENTAGE", bps: 1000 } }),
  );
  assert.ok(full.ok && disc.ok);
  assert.equal(disc.discountCents, 255); // 10% of €25.50
  assert.ok(disc.vatTotalCents < full.vatTotalCents, "VAT should fall with the discount");
});

test("quantity must be sane", () => {
  for (const q of [0, -1, 1.5, 999]) {
    const r = priceOrder([{ productId: "p-025", quantity: q, modifierIds: [] }], ctx());
    assert.equal(r.ok, false, `quantity ${q} should be rejected`);
  }
});

test("an empty basket is rejected", () => {
  const r = priceOrder([], ctx());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0]?.code, "EMPTY_CART");
});

test("an unknown product id is rejected (not silently priced at zero)", () => {
  const r = priceOrder([{ productId: "does-not-exist", quantity: 1, modifierIds: [] }], ctx());
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors[0]?.code, "PRODUCT_NOT_FOUND");
});

// ---------------------------------------------------------- state machine --
section("Order state machine");

test("the happy delivery path is legal end to end", () => {
  const path: OrderStatus[] = [
    "DRAFT", "PENDING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY",
    "OUT_FOR_DELIVERY", "COMPLETED",
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`);
  }
});

test("the happy pickup path is legal end to end", () => {
  const path: OrderStatus[] = [
    "DRAFT", "PENDING_PAYMENT", "PLACED", "ACCEPTED", "PREPARING", "READY",
    "AWAITING_PICKUP", "COMPLETED",
  ];
  for (let i = 0; i < path.length - 1; i++) {
    assert.ok(canTransition(path[i]!, path[i + 1]!), `${path[i]} → ${path[i + 1]}`);
  }
});

test("terminal states are truly terminal", () => {
  for (const s of ["COMPLETED", "REJECTED", "CANCELLED", "ABANDONED", "FAILED"] as OrderStatus[]) {
    assert.ok(isTerminal(s));
    assert.equal(ORDER_TRANSITIONS[s].length, 0, `${s} should have no exits`);
  }
});

test("an order cannot skip payment", () => {
  assert.equal(canTransition("DRAFT", "ACCEPTED"), false);
  assert.equal(canTransition("DRAFT", "PLACED"), false);
});

test("a completed order cannot be resurrected", () => {
  assert.equal(canTransition("COMPLETED", "PREPARING"), false);
  assert.equal(canTransition("REJECTED", "ACCEPTED"), false);
});

test("only a payment webhook can mark an order PLACED", () => {
  assert.throws(
    () => assertTransition("PENDING_PAYMENT", "PLACED", { fulfilmentType: "DELIVERY", actorType: "CUSTOMER" }),
    InvalidTransitionError,
  );
  assert.doesNotThrow(() =>
    assertTransition("PENDING_PAYMENT", "PLACED", { fulfilmentType: "DELIVERY", actorType: "STRIPE" }),
  );
});

test("only staff can accept or reject", () => {
  assert.throws(
    () => assertTransition("PLACED", "ACCEPTED", { fulfilmentType: "DELIVERY", actorType: "CUSTOMER" }),
    InvalidTransitionError,
  );
  assert.doesNotThrow(() =>
    assertTransition("PLACED", "ACCEPTED", { fulfilmentType: "DELIVERY", actorType: "STAFF" }),
  );
});

test("a pickup order cannot go out for delivery", () => {
  assert.throws(
    () => assertTransition("READY", "OUT_FOR_DELIVERY", { fulfilmentType: "PICKUP", actorType: "STAFF" }),
    /collection order cannot go out for delivery/,
  );
});

test("a delivery order cannot await collection", () => {
  assert.throws(
    () => assertTransition("READY", "AWAITING_PICKUP", { fulfilmentType: "DELIVERY", actorType: "STAFF" }),
    /cannot await collection/,
  );
});

test("statusAfterReady branches on fulfilment type", () => {
  assert.equal(statusAfterReady("DELIVERY"), "OUT_FOR_DELIVERY");
  assert.equal(statusAfterReady("PICKUP"), "AWAITING_PICKUP");
});

test("cancellation fee warning fires only when a Wolt delivery exists", () => {
  // €3.00 Cancellation Fee applies once Wolt has confirmed the order.
  assert.equal(cancellationIncursWoltFee("ACCEPTED", "DELIVERY", true), true);
  assert.equal(cancellationIncursWoltFee("ACCEPTED", "DELIVERY", false), false); // rejected before creation
  assert.equal(cancellationIncursWoltFee("ACCEPTED", "PICKUP", false), false);
  assert.equal(cancellationIncursWoltFee("COMPLETED", "DELIVERY", true), false);
});

// ------------------------------------------------------------ Wolt events --
section("Wolt webhook ordering guard");

test("normal event sequence advances the delivery", () => {
  const seq = [
    ["order.received", "CREATED"],
    ["order.pickup_started", "PICKUP_STARTED"],
    ["order.picked_up", "PICKED_UP"],
    ["order.dropoff_started", "DROPOFF_STARTED"],
    ["order.delivered", "DELIVERED"],
  ] as const;
  let status: any = "CREATION_PENDING";
  for (const [event, expected] of seq) {
    const r = applyWoltEvent({ currentStatus: status, eventType: event });
    assert.ok(r.advance, `${event} should advance from ${status}`);
    if (r.advance) {
      assert.equal(r.nextStatus, expected);
      status = r.nextStatus;
    }
  }
});

test("A LATE EVENT CANNOT DRAG A DELIVERED ORDER BACKWARDS", () => {
  // Wolt's docs warn events may arrive out of order. This is the guard.
  const r = applyWoltEvent({ currentStatus: "DELIVERED", eventType: "order.pickup_started" });
  assert.equal(r.advance, false);
  if (!r.advance) assert.equal(r.reason, "ALREADY_TERMINAL");
});

test("a stale mid-flight event is ignored", () => {
  const r = applyWoltEvent({ currentStatus: "DROPOFF_STARTED", eventType: "order.pickup_started" });
  assert.equal(r.advance, false);
  if (!r.advance) assert.equal(r.reason, "OUT_OF_ORDER");
});

test("informational events never change status", () => {
  for (const e of ["order.pickup_eta_updated", "order.dropoff_eta_updated", "order.pickup_arrival", "order.dropoff_arrival"]) {
    const r = applyWoltEvent({ currentStatus: "PICKED_UP", eventType: e });
    assert.equal(r.advance, false, `${e} should not advance status`);
    if (!r.advance) assert.equal(r.reason, "NOT_A_STATUS_EVENT");
  }
});

test("the same event delivered twice does not double-apply", () => {
  const first = applyWoltEvent({ currentStatus: "PICKED_UP", eventType: "order.delivered" });
  assert.ok(first.advance);
  const second = applyWoltEvent({ currentStatus: "DELIVERED", eventType: "order.delivered" });
  assert.equal(second.advance, false);
});

test("a rejection after creation is honoured", () => {
  const r = applyWoltEvent({ currentStatus: "CREATED", eventType: "order.rejected" });
  assert.ok(r.advance);
  if (r.advance) assert.equal(r.nextStatus, "REJECTED");
});

test("Wolt error codes map to the documented actions", () => {
  assert.equal(actionForWoltError("SHIPMENT_PROMISE_NOT_FOUND"), "REQUOTE_THEN_RETRY");
  assert.equal(actionForWoltError("DROPOFF_OUTSIDE_OF_DELIVERY_AREA"), "BLOCK_DELIVERY_ADDRESS");
  assert.equal(actionForWoltError("DUPLICATE_ORDER"), "TREAT_AS_SUCCESS");
  assert.equal(actionForWoltError("VENUE_CLOSED"), "DISABLE_DELIVERY_TEMPORARILY");
  assert.equal(actionForWoltError("SOMETHING_NEW"), "ALERT_STAFF"); // unknown → human
});

test("retry policy follows Wolt's documentation", () => {
  // "maximum 5 retries per request" — the 5th retry is allowed, the 6th is not.
  assert.equal(shouldRetryHttpStatus(500, 0).retry, true);
  assert.equal(shouldRetryHttpStatus(503, 4).retry, true, "5th retry still allowed");
  assert.equal(shouldRetryHttpStatus(503, WOLT_MAX_RETRIES).retry, false, "6th retry refused");

  // 4xx must never be retried — it will produce an identical response.
  assert.equal(shouldRetryHttpStatus(400, 0).retry, false);
  assert.equal(shouldRetryHttpStatus(422, 0).retry, false);
  assert.equal(shouldRetryHttpStatus(401, 0).retry, false);
  assert.equal(shouldRetryHttpStatus(404, 0).retry, false);

  // 429 is the documented exception: wait 5s-1min, then retry.
  const first429 = shouldRetryHttpStatus(429, 0);
  assert.equal(first429.retry, true);
  assert.ok(first429.delayMs >= 5_000 && first429.delayMs <= 60_000);

  // Backoff grows but stays bounded.
  assert.ok(shouldRetryHttpStatus(500, 3).delayMs > shouldRetryHttpStatus(500, 1).delayMs);
  assert.ok(shouldRetryHttpStatus(500, 4).delayMs <= 60_000);
});

// ------------------------------------------------------------ opening hours --
section("Opening hours (Asia/Nicosia)");

const HOURS: OpeningHoursRow[] = ([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((d) => ({
  dayOfWeek: d, opensAt: 720, closesAt: 1350, isClosed: false,
}));

function availCfg(over: Partial<AvailabilityConfig> = {}): AvailabilityConfig {
  return {
    timezone: "Asia/Nicosia",
    hours: HOURS,
    deliveryEnabled: true,
    pickupEnabled: true,
    lastOrderBufferMinutes: 25,
    ...over,
  };
}

test("UTC instants convert to Nicosia local time", () => {
  // 2026-08-20 12:00 UTC = 15:00 in Nicosia (UTC+3 in summer)
  const m = toLocalMoment(new Date("2026-08-20T12:00:00Z"), "Asia/Nicosia");
  assert.equal(m.minutesSinceMidnight, 15 * 60);
  assert.equal(m.dateKey, "2026-08-20");
  assert.equal(m.dayOfWeek, 4); // Thursday
});

test("open during service", () => {
  const a = getAvailability(new Date("2026-08-20T16:00:00Z"), availCfg()); // 19:00 local
  assert.equal(a.isOpen, true);
  assert.equal(a.acceptingOrders, true);
  assert.equal(a.deliveryAvailable, true);
});

test("closed before opening", () => {
  const a = getAvailability(new Date("2026-08-20T06:00:00Z"), availCfg()); // 09:00 local
  assert.equal(a.acceptingOrders, false);
  assert.equal(a.reason, "BEFORE_OPENING");
});

test("closed after closing", () => {
  const a = getAvailability(new Date("2026-08-20T20:00:00Z"), availCfg()); // 23:00 local
  assert.equal(a.acceptingOrders, false);
  assert.equal(a.reason, "AFTER_CLOSING");
});

test("orders stop before the kitchen closes", () => {
  // 22:10 local — inside opening hours, but 25 min prep would run past 22:30.
  const a = getAvailability(new Date("2026-08-20T19:10:00Z"), availCfg());
  assert.equal(a.isOpen, true);
  assert.equal(a.acceptingOrders, false);
  assert.equal(a.reason, "TOO_CLOSE_TO_CLOSING");
  assert.equal(a.lastOrderAt, 1325); // 22:05
});

test("the delivery kill-switch works without closing pickup", () => {
  const a = getAvailability(new Date("2026-08-20T16:00:00Z"), availCfg({ deliveryEnabled: false }));
  assert.equal(a.acceptingOrders, true);
  assert.equal(a.deliveryAvailable, false);
  assert.equal(a.pickupAvailable, true);
});

test("a holiday closure overrides normal hours", () => {
  const a = getAvailability(
    new Date("2026-08-20T16:00:00Z"),
    availCfg({ exceptions: [{ date: "2026-08-20", isClosed: true, note: "Private event" }] }),
  );
  assert.equal(a.acceptingOrders, false);
  assert.equal(a.reason, "CLOSED_TODAY");
  assert.equal(a.note, "Private event");
});

test("an exception can also shorten a day rather than close it", () => {
  const a = getAvailability(
    new Date("2026-08-20T16:00:00Z"), // 19:00 local
    availCfg({ exceptions: [{ date: "2026-08-20", isClosed: false, closesAt: 1080 }] }), // closes 18:00
  );
  assert.equal(a.acceptingOrders, false);
  assert.equal(a.reason, "AFTER_CLOSING");
});

test("prep time rises during the dinner rush", () => {
  const cfg = {
    defaultPrepMinutes: 25, peakPrepMinutes: 35,
    peakWindows: DEFAULT_PEAK_WINDOWS, timezone: "Asia/Nicosia",
  };
  // 16:00 local — quiet
  assert.equal(suggestedPrepMinutes(new Date("2026-08-20T13:00:00Z"), cfg), 25);
  // 20:00 local — dinner rush
  assert.equal(suggestedPrepMinutes(new Date("2026-08-20T17:00:00Z"), cfg), 35);
  // 13:00 local — lunch rush
  assert.equal(suggestedPrepMinutes(new Date("2026-08-20T10:00:00Z"), cfg), 35);
});

test("winter time is handled (UTC+2, not +3)", () => {
  // January: Cyprus is UTC+2. 17:00 UTC = 19:00 local, still open.
  const a = getAvailability(new Date("2026-01-15T17:00:00Z"), availCfg());
  assert.equal(a.acceptingOrders, true);
  // If we had naively assumed +3 we would have computed 20:00 — also open,
  // so check a boundary that actually distinguishes them:
  const m = toLocalMoment(new Date("2026-01-15T17:00:00Z"), "Asia/Nicosia");
  assert.equal(m.minutesSinceMidnight, 19 * 60, "January must be UTC+2");
});

// ------------------------------------------------------------------ report --
console.log("\n" + "=".repeat(66));
if (failures.length === 0) {
  console.log(`  ALL ${passed} TESTS PASSED`);
} else {
  console.log(`  ${passed} passed, ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
}
console.log("=".repeat(66) + "\n");

process.exit(failures.length === 0 ? 0 : 1);
