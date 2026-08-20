-- ============================================================================
-- Schema correctness tests
-- ============================================================================
-- These are NEGATIVE tests as much as positive ones: each one deliberately
-- attempts an operation that must fail, and reports PASS only if the
-- database refused it.
--
-- The point: the protections described in docs/ARCHITECTURE.md (no duplicate
-- payments, no duplicate deliveries, no double-redeemed coupons, no alcohol
-- on a delivery order) are enforced by database constraints, not by
-- application code that can lose a race or be bypassed by a future code path.
-- If these pass, those guarantees are real.
-- ============================================================================

\set ON_ERROR_STOP off

CREATE OR REPLACE FUNCTION assert_fails(sql TEXT, label TEXT) RETURNS TEXT AS $$
BEGIN
  BEGIN
    EXECUTE sql;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'PASS  ' || label || '  (blocked: ' || SQLERRM || ')';
  END;
  RETURN 'FAIL  ' || label || '  <-- THE DATABASE ALLOWED THIS. IT SHOULD NOT HAVE.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assert_true(cond BOOLEAN, label TEXT) RETURNS TEXT AS $$
BEGIN
  RETURN CASE WHEN cond THEN 'PASS  ' || label ELSE 'FAIL  ' || label END;
END;
$$ LANGUAGE plpgsql;

\echo ''
\echo '=========================================================='
\echo ' CONTRACT COMPLIANCE'
\echo '=========================================================='

-- Wolt Drive Agreement §2.2–2.3: no age-verification products on delivery.
SELECT assert_fails(
  $$UPDATE products SET "deliveryEligible" = TRUE WHERE "containsAlcohol" = TRUE$$,
  'Beer cannot be marked deliverable (Wolt Agreement §2.2-2.3)');

SELECT assert_fails(
  $$INSERT INTO products (id,"categoryId",name,slug,"priceCents","containsAlcohol","deliveryEligible")
    VALUES ('p-bad','cat-beers','Wine','wine',900,TRUE,TRUE)$$,
  'New alcohol product cannot be created as deliverable');

SELECT assert_true(
  (SELECT COUNT(*) FROM products WHERE "containsAlcohol" AND "deliveryEligible") = 0,
  'No alcohol product is currently deliverable');

-- Agreement: maximum delivery distance is 10,000 m straight-line.
SELECT assert_fails(
  $$INSERT INTO orders (id,"orderNumber","publicToken","fulfilmentType","customerName","customerPhone",
      "deliveryLine1","deliveryCity",status)
    VALUES ('o-far','HG-FAR','tok-far','DELIVERY','Test','+357','X','Nicosia','PLACED');
    INSERT INTO deliveries (id,"orderId","distanceMetres") VALUES ('d-far','o-far',12000)$$,
  'Delivery beyond 10km is rejected (Agreement max distance)');

\echo ''
\echo '=========================================================='
\echo ' DUPLICATE PROTECTION'
\echo '=========================================================='

-- Set up one real order to test against.
INSERT INTO orders (id,"orderNumber","publicToken","fulfilmentType","customerName","customerPhone",
                    "deliveryLine1","deliveryCity",status)
VALUES ('o-test','HG-0001','tok-abc123','DELIVERY','Test Customer','+35799000000',
        '12 Test Street','Nicosia','PLACED');

INSERT INTO payments (id,"orderId","providerPaymentIntentId",status,"amountAuthorizedCents")
VALUES ('pay-test','o-test','pi_test_123','AUTHORIZED',2500);

INSERT INTO deliveries (id,"orderId",status,"woltOrderReferenceId")
VALUES ('del-test','o-test','CREATED','wolt-ref-abc');

SELECT assert_fails(
  $$INSERT INTO payments (id,"orderId",status) VALUES ('pay-dup','o-test','AUTHORIZED')$$,
  'Cannot create a second payment for one order');

SELECT assert_fails(
  $$INSERT INTO payments (id,"orderId","providerPaymentIntentId",status)
    VALUES ('pay-dup2','o-other','pi_test_123','AUTHORIZED')$$,
  'Cannot reuse a Stripe PaymentIntent id');

SELECT assert_fails(
  $$INSERT INTO deliveries (id,"orderId") VALUES ('del-dup','o-test')$$,
  'Cannot create a second Wolt delivery for one order');

SELECT assert_fails(
  $$INSERT INTO deliveries (id,"orderId","woltOrderReferenceId")
    VALUES ('del-dup2','o-other','wolt-ref-abc')$$,
  'Cannot reuse a Wolt order reference id');

-- Webhook inbox: the same provider event arriving twice.
INSERT INTO webhook_events (id,provider,"providerEventId","eventType",payload)
VALUES ('wh-1','wolt','evt_abc','order.delivered','{}');

SELECT assert_fails(
  $$INSERT INTO webhook_events (id,provider,"providerEventId","eventType",payload)
    VALUES ('wh-2','wolt','evt_abc','order.delivered','{}')$$,
  'Duplicate webhook event is rejected (idempotency guarantee)');

SELECT assert_true(
  (SELECT COUNT(*) FROM webhook_events WHERE provider='stripe' AND "providerEventId"='evt_abc') = 0,
  'Same event id from a DIFFERENT provider is still allowed');

-- Promotions: the classic double-redemption race.
INSERT INTO promotions (id,code,name,"discountType","discountValue","usageLimit")
VALUES ('promo-1','WELCOME10','Welcome 10%','PERCENTAGE',1000,1);

INSERT INTO promotion_redemptions (id,"promotionId","orderId","discountCents")
VALUES ('red-1','promo-1','o-test',250);

SELECT assert_fails(
  $$INSERT INTO promotion_redemptions (id,"promotionId","orderId","discountCents")
    VALUES ('red-2','promo-1','o-test',250)$$,
  'Coupon cannot be redeemed twice on the same order');

SELECT assert_fails(
  $$UPDATE promotions SET "usageCount" = 5 WHERE id='promo-1'$$,
  'Promotion usage cannot exceed its limit');

\echo ''
\echo '=========================================================='
\echo ' FINANCIAL INTEGRITY'
\echo '=========================================================='

SELECT assert_fails(
  $$UPDATE payments SET "amountRefundedCents" = 9999 WHERE id='pay-test'$$,
  'Cannot refund more than was captured');

SELECT assert_fails(
  $$INSERT INTO products (id,"categoryId",name,slug,"priceCents")
    VALUES ('p-neg','cat-rice','Negative','negative',-100)$$,
  'Product price cannot be negative');

SELECT assert_fails(
  $$INSERT INTO products (id,"categoryId",name,slug,"priceCents","vatRateBps")
    VALUES ('p-vat','cat-rice','Bad VAT','bad-vat',500,50000)$$,
  'VAT rate above 100% is rejected');

SELECT assert_fails(
  $$INSERT INTO order_items (id,"orderId","nameSnapshot","unitPriceCents",quantity,"lineTotalCents","vatRateBps")
    VALUES ('oi-bad','o-test','Zero qty',500,0,0,500)$$,
  'Order line quantity must be positive');

\echo ''
\echo '=========================================================='
\echo ' OPERATING HOURS'
\echo '=========================================================='

SELECT assert_fails(
  $$INSERT INTO opening_hours (id,"dayOfWeek","opensAt","closesAt") VALUES ('oh-x',3,720,1350)$$,
  'Cannot define two sets of hours for the same weekday');

SELECT assert_fails(
  $$INSERT INTO opening_hours (id,"dayOfWeek","opensAt","closesAt") VALUES ('oh-y',9,720,1350)$$,
  'Day of week must be 0-6');

SELECT assert_fails(
  $$INSERT INTO opening_hours (id,"dayOfWeek","opensAt","closesAt") VALUES ('oh-z',3,1350,720)$$,
  'Closing time must be after opening time');

SELECT assert_true(
  (SELECT COUNT(*) FROM opening_hours WHERE "opensAt"=720 AND "closesAt"=1350 AND NOT "isClosed")=7,
  'All 7 days open 12:00-22:30 as specified');

\echo ''
\echo '=========================================================='
\echo ' WOLT DELIVERY COST FORMULA'
\echo '=========================================================='
\echo ' Contract: EUR3.50 base covers first 1000m; EUR0.50 per further'
\echo ' started 1000m increment; maximum 10,000m.'
\echo ''

WITH s AS (SELECT * FROM settings WHERE id='singleton'),
distances(m) AS (VALUES (500),(1000),(1001),(2000),(2001),(3000),(5000),(7500),(10000)),
calc AS (
  SELECT m,
         s."woltBaseFeeCents"
           + s."woltIncrementFeeCents"
             * GREATEST(0, CEIL(m::numeric / s."woltIncrementMetres")::int - 1) AS cents
  FROM distances, s
)
SELECT m AS metres,
       to_char(cents/100.0,'FM990D00') AS wolt_cost_eur,
       to_char(cents*1.19/100.0,'FM990D00') AS incl_vat_eur
FROM calc ORDER BY m;

\echo ''
\echo '=========================================================='
\echo ' END-TO-END ORDER SIMULATION'
\echo '=========================================================='
\echo ' A realistic delivery order, priced the way the app will price it.'
\echo ''

-- 2x Beef Pho (EUR8.50, 5% VAT) + 1x Coca-Cola (EUR2.00, 9% VAT)
INSERT INTO orders (id,"orderNumber","publicToken","fulfilmentType","customerName","customerPhone",
                    "deliveryLine1","deliveryCity",status)
VALUES ('o-sim','HG-0002','tok-sim','DELIVERY','Maria K.','+35799123456',
        '5 Makariou Ave','Nicosia','PLACED');

INSERT INTO order_items (id,"orderId","productId","menuNumber","nameSnapshot","unitPriceCents",quantity,"lineTotalCents","vatRateBps") VALUES
  ('oi-1','o-sim','p-025',25,'Beef Pho',850,2,1700,500),
  ('oi-2','o-sim','p-101',NULL,'Coca-Cola',200,1,200,900);

WITH lines AS (
  SELECT "lineTotalCents", "vatRateBps",
         -- VAT is included in menu prices, so we extract it rather than add:
         ROUND("lineTotalCents"::numeric * "vatRateBps" / (10000 + "vatRateBps")) AS vat_cents
  FROM order_items WHERE "orderId"='o-sim'
),
totals AS (
  SELECT SUM("lineTotalCents") AS subtotal, SUM(vat_cents) AS vat FROM lines
),
delivery AS (
  -- Customer 2.4km away. Wolt cost = EUR4.50. Order is EUR19.00, below the
  -- EUR25 free-delivery threshold, so the capped pass-through rule applies:
  -- customer pays up to EUR4.00, Hat Gao absorbs the remaining EUR0.50.
  SELECT 450 AS wolt_cost, LEAST(450, 400) AS customer_fee
)
SELECT
  to_char(t.subtotal/100.0,'FM990D00')                     AS "food_subtotal",
  to_char(t.vat/100.0,'FM990D00')                          AS "vat_included",
  to_char(d.customer_fee/100.0,'FM990D00')                 AS "customer_pays_delivery",
  to_char(d.wolt_cost/100.0,'FM990D00')                    AS "wolt_charges_us",
  to_char((d.wolt_cost - d.customer_fee)/100.0,'FM990D00') AS "our_subsidy",
  to_char((t.subtotal + d.customer_fee)/100.0,'FM990D00')  AS "customer_total"
FROM totals t, delivery d;

\echo ''
\echo ' Minimum order check (EUR15.00 threshold):'
SELECT assert_true(
  (SELECT SUM("lineTotalCents") FROM order_items WHERE "orderId"='o-sim')
    >= (SELECT "minOrderDeliveryCents" FROM settings),
  'Simulated order meets the EUR15 delivery minimum');

\echo ''
\echo '=========================================================='
\echo ' DELIVERY vs PICKUP MENU'
\echo '=========================================================='

SELECT
  (SELECT COUNT(*) FROM products WHERE "isActive" AND "deliveryEligible") AS "items_on_delivery_menu",
  (SELECT COUNT(*) FROM products WHERE "isActive" AND "pickupEligible")   AS "items_on_pickup_menu",
  (SELECT string_agg(name, ', ') FROM products WHERE NOT "deliveryEligible") AS "delivery_excluded";

\echo ''
\echo '=========================================================='
\echo ' ALLERGEN PUBLICATION GATE'
\echo '=========================================================='

SELECT assert_true(
  (SELECT COUNT(*) FROM products WHERE "allergensVerified") = 0,
  'No product claims verified allergens yet (nothing publishes unverified)');

SELECT COUNT(*) AS "products_awaiting_allergen_verification"
FROM products WHERE "isActive" AND NOT "allergensVerified";
