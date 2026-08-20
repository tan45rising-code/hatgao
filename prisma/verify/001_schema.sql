-- ============================================================================
-- Hand-derived DDL equivalent to prisma/schema.prisma
-- ============================================================================
-- Purpose: verify the schema design against a real PostgreSQL server.
--
-- This exists because the development sandbox currently cannot reach the
-- npm registry, so `prisma migrate` can't be run here. Rather than ship an
-- unverified schema, this file reproduces it as plain SQL so the design can
-- be executed and tested for real: constraints, foreign keys, unique
-- indexes and enum values all get exercised.
--
-- Prisma remains the source of truth. When npm access returns,
-- `prisma migrate dev` generates the real migration and this folder can be
-- deleted. Until then, this is the proof the design works.
-- ============================================================================

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------------------------------------------------------------- ENUMS ---
CREATE TYPE "FulfilmentType" AS ENUM ('DELIVERY', 'PICKUP');

CREATE TYPE "OrderStatus" AS ENUM (
  'DRAFT', 'PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'READY',
  'OUT_FOR_DELIVERY', 'AWAITING_PICKUP', 'COMPLETED', 'REJECTED',
  'CANCELLED', 'ABANDONED', 'FAILED'
);

CREATE TYPE "PaymentStatus" AS ENUM (
  'REQUIRES_PAYMENT', 'PROCESSING', 'AUTHORIZED', 'CAPTURED',
  'CAPTURE_FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED', 'FAILED'
);

CREATE TYPE "DeliveryStatus" AS ENUM (
  'NOT_REQUIRED', 'QUOTED', 'CREATION_PENDING', 'CREATION_FAILED', 'CREATED',
  'PICKUP_STARTED', 'PICKED_UP', 'DROPOFF_STARTED', 'DELIVERED',
  'CANCELLED', 'REJECTED', 'CUSTOMER_NO_SHOW'
);

CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'STAFF');

CREATE TYPE "Allergen" AS ENUM (
  'CEREALS_CONTAINING_GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS',
  'SOYBEANS', 'MILK', 'NUTS', 'CELERY', 'MUSTARD', 'SESAME_SEEDS',
  'SULPHITES', 'LUPIN', 'MOLLUSCS'
);

CREATE TYPE "AllergenPresence" AS ENUM ('CONTAINS', 'MAY_CONTAIN');
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_DELIVERY');
CREATE TYPE "PromotionScope" AS ENUM ('DELIVERY_ONLY', 'PICKUP_ONLY', 'BOTH');

CREATE TYPE "DeliveryPricingRuleType" AS ENUM (
  'FLAT_FEE', 'PASS_THROUGH', 'CAPPED_PASS_THROUGH', 'FREE_ABOVE_THRESHOLD',
  'TIERED_BY_ORDER_VALUE', 'DISTANCE_GUARD'
);

CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'DUPLICATE');
CREATE TYPE "ActorType" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM', 'STRIPE', 'WOLT');

-- ------------------------------------------------------- CONFIGURATION ---
CREATE TABLE settings (
  id                          TEXT PRIMARY KEY DEFAULT 'singleton',
  "restaurantName"            TEXT NOT NULL DEFAULT 'Hat Gao',
  "addressLine"               TEXT NOT NULL DEFAULT '58 Vasiliou Voulgaroktonou',
  city                        TEXT NOT NULL DEFAULT 'Nicosia',
  postcode                    TEXT NOT NULL DEFAULT '1010',
  country                     TEXT NOT NULL DEFAULT 'CY',
  latitude                    DOUBLE PRECISION,
  longitude                   DOUBLE PRECISION,
  phone                       TEXT NOT NULL DEFAULT '+35722002235',
  email                       TEXT NOT NULL DEFAULT 'hatgao.restaurant@gmail.com',
  timezone                    TEXT NOT NULL DEFAULT 'Asia/Nicosia',
  currency                    TEXT NOT NULL DEFAULT 'EUR',
  "deliveryEnabled"           BOOLEAN NOT NULL DEFAULT TRUE,
  "pickupEnabled"             BOOLEAN NOT NULL DEFAULT TRUE,
  "minOrderDeliveryCents"     INTEGER NOT NULL DEFAULT 1500,
  "minOrderPickupCents"       INTEGER NOT NULL DEFAULT 0,
  "defaultPrepMinutes"        INTEGER NOT NULL DEFAULT 25,
  "peakPrepMinutes"           INTEGER NOT NULL DEFAULT 35,
  "orderAckTimeoutMinutes"    INTEGER NOT NULL DEFAULT 5,
  "orderAckEscalationMinutes" INTEGER NOT NULL DEFAULT 10,
  "woltBaseFeeCents"          INTEGER NOT NULL DEFAULT 350,
  "woltBaseDistanceMetres"    INTEGER NOT NULL DEFAULT 1000,
  "woltIncrementFeeCents"     INTEGER NOT NULL DEFAULT 50,
  "woltIncrementMetres"       INTEGER NOT NULL DEFAULT 1000,
  "woltMaxDistanceMetres"     INTEGER NOT NULL DEFAULT 10000,
  "woltMerchantId"            TEXT,
  "woltVenueId"               TEXT,
  "largeOrderItemThreshold"   INTEGER NOT NULL DEFAULT 15,
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE opening_hours (
  id          TEXT PRIMARY KEY,
  "dayOfWeek" INTEGER NOT NULL,
  "opensAt"   INTEGER NOT NULL,
  "closesAt"  INTEGER NOT NULL,
  "isClosed"  BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT opening_hours_day_unique UNIQUE ("dayOfWeek"),
  -- Guard rails: a day is 1440 minutes, and you cannot close before opening.
  CONSTRAINT opening_hours_range_valid CHECK ("opensAt" >= 0 AND "opensAt" <= 1440),
  CONSTRAINT opening_hours_close_valid CHECK ("closesAt" >= 0 AND "closesAt" <= 1440),
  CONSTRAINT opening_hours_order_valid CHECK ("isClosed" OR "closesAt" > "opensAt"),
  CONSTRAINT opening_hours_dow_valid   CHECK ("dayOfWeek" BETWEEN 0 AND 6)
);

CREATE TABLE service_exceptions (
  id         TEXT PRIMARY KEY,
  date       DATE NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT TRUE,
  "opensAt"  INTEGER,
  "closesAt" INTEGER,
  note       TEXT,
  CONSTRAINT service_exceptions_date_unique UNIQUE (date)
);

-- ----------------------------------------------------------------- MENU ---
CREATE TABLE categories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  description   TEXT,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"   TIMESTAMPTZ
);
CREATE INDEX categories_sort_idx ON categories ("sortOrder");

CREATE TABLE products (
  id                    TEXT PRIMARY KEY,
  "categoryId"          TEXT NOT NULL REFERENCES categories(id),
  "menuNumber"          INTEGER,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  "priceCents"          INTEGER NOT NULL,
  "vatRateBps"          INTEGER NOT NULL DEFAULT 500,
  "imageUrl"            TEXT,
  "imageAlt"            TEXT,
  "isAvailable"         BOOLEAN NOT NULL DEFAULT TRUE,
  "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
  "deliveryEligible"    BOOLEAN NOT NULL DEFAULT TRUE,
  "pickupEligible"      BOOLEAN NOT NULL DEFAULT TRUE,
  "containsAlcohol"     BOOLEAN NOT NULL DEFAULT FALSE,
  "allergensVerified"   BOOLEAN NOT NULL DEFAULT FALSE,
  "allergensVerifiedAt" TIMESTAMPTZ,
  "allergensVerifiedBy" TEXT,
  "prepMinutesOverride" INTEGER,
  "sortOrder"           INTEGER NOT NULL DEFAULT 0,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"           TIMESTAMPTZ,
  -- Money and tax can never be negative or nonsensical.
  CONSTRAINT products_price_nonneg CHECK ("priceCents" >= 0),
  CONSTRAINT products_vat_valid    CHECK ("vatRateBps" >= 0 AND "vatRateBps" <= 10000),
  -- Alcohol must never be flagged deliverable: Wolt Drive Agreement §2.2–2.3
  -- prohibits products requiring age verification. Enforced in the database
  -- so no future code path can quietly re-enable it.
  CONSTRAINT products_alcohol_not_deliverable
    CHECK (NOT ("containsAlcohol" AND "deliveryEligible"))
);
CREATE INDEX products_category_sort_idx ON products ("categoryId", "sortOrder");
CREATE INDEX products_menu_number_idx   ON products ("menuNumber");

CREATE TABLE product_allergens (
  id          TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  allergen    "Allergen" NOT NULL,
  presence    "AllergenPresence" NOT NULL DEFAULT 'CONTAINS',
  CONSTRAINT product_allergens_unique UNIQUE ("productId", allergen)
);

CREATE TABLE modifier_groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  "minSelect"   INTEGER NOT NULL DEFAULT 1,
  "maxSelect"   INTEGER NOT NULL DEFAULT 1,
  "isRequired"  BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT modifier_groups_select_valid CHECK ("maxSelect" >= "minSelect" AND "minSelect" >= 0)
);

CREATE TABLE modifiers (
  id                TEXT PRIMARY KEY,
  "groupId"         TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL DEFAULT 0,
  "isAvailable"     BOOLEAN NOT NULL DEFAULT TRUE,
  "isDefault"       BOOLEAN NOT NULL DEFAULT FALSE,
  "sortOrder"       INTEGER NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"       TIMESTAMPTZ
);
CREATE INDEX modifiers_group_sort_idx ON modifiers ("groupId", "sortOrder");

CREATE TABLE modifier_allergens (
  id           TEXT PRIMARY KEY,
  "modifierId" TEXT NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
  allergen     "Allergen" NOT NULL,
  presence     "AllergenPresence" NOT NULL DEFAULT 'CONTAINS',
  CONSTRAINT modifier_allergens_unique UNIQUE ("modifierId", allergen)
);

CREATE TABLE product_modifier_groups (
  id          TEXT PRIMARY KEY,
  "productId" TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  "groupId"   TEXT NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT product_modifier_groups_unique UNIQUE ("productId", "groupId")
);

-- --------------------------------------------------------------- PEOPLE ---
CREATE TABLE staff_users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  "passwordHash"     TEXT NOT NULL,
  role               "StaffRole" NOT NULL DEFAULT 'STAFF',
  "isActive"         BOOLEAN NOT NULL DEFAULT TRUE,
  "twoFactorSecret"  TEXT,
  "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "lastLoginAt"      TIMESTAMPTZ,
  "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil"      TIMESTAMPTZ,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"        TIMESTAMPTZ
);

CREATE TABLE customers (
  id                   TEXT PRIMARY KEY,
  email                TEXT UNIQUE,
  phone                TEXT,
  name                 TEXT,
  "marketingConsentAt" TIMESTAMPTZ,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"          TIMESTAMPTZ
);
CREATE INDEX customers_phone_idx ON customers (phone);

CREATE TABLE addresses (
  id             TEXT PRIMARY KEY,
  "customerId"   TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label          TEXT,
  line1          TEXT NOT NULL,
  line2          TEXT,
  city           TEXT NOT NULL,
  postcode       TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  instructions   TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"    TIMESTAMPTZ
);

-- --------------------------------------------------------------- ORDERS ---
CREATE TABLE orders (
  id                         TEXT PRIMARY KEY,
  "orderNumber"              TEXT NOT NULL UNIQUE,
  "publicToken"              TEXT NOT NULL UNIQUE,
  status                     "OrderStatus" NOT NULL DEFAULT 'DRAFT',
  "fulfilmentType"           "FulfilmentType" NOT NULL,
  "customerId"               TEXT REFERENCES customers(id),
  "customerName"             TEXT NOT NULL,
  "customerPhone"            TEXT NOT NULL,
  "customerEmail"            TEXT,
  "deliveryLine1"            TEXT,
  "deliveryLine2"            TEXT,
  "deliveryCity"             TEXT,
  "deliveryPostcode"         TEXT,
  "deliveryLatitude"         DOUBLE PRECISION,
  "deliveryLongitude"        DOUBLE PRECISION,
  "deliveryInstructions"     TEXT,
  "subtotalCents"            INTEGER NOT NULL DEFAULT 0,
  "discountCents"            INTEGER NOT NULL DEFAULT 0,
  "customerDeliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
  "woltCostCents"            INTEGER NOT NULL DEFAULT 0,
  "subsidyCents"             INTEGER NOT NULL DEFAULT 0,
  "vatTotalCents"            INTEGER NOT NULL DEFAULT 0,
  "totalCents"               INTEGER NOT NULL DEFAULT 0,
  currency                   TEXT NOT NULL DEFAULT 'EUR',
  notes                      TEXT,
  "rejectionReason"          TEXT,
  "promisedPrepMinutes"      INTEGER,
  "promisedReadyAt"          TIMESTAMPTZ,
  "acceptedAt"               TIMESTAMPTZ,
  "readyAt"                  TIMESTAMPTZ,
  "completedAt"              TIMESTAMPTZ,
  "scheduledFor"             TIMESTAMPTZ,
  version                    INTEGER NOT NULL DEFAULT 0,
  "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A delivery order without an address is not a valid order.
  CONSTRAINT orders_delivery_needs_address CHECK (
    "fulfilmentType" <> 'DELIVERY'
    OR status IN ('DRAFT', 'PENDING_PAYMENT')
    OR ("deliveryLine1" IS NOT NULL AND "deliveryCity" IS NOT NULL)
  ),
  CONSTRAINT orders_totals_nonneg CHECK (
    "subtotalCents" >= 0 AND "discountCents" >= 0
    AND "customerDeliveryFeeCents" >= 0 AND "totalCents" >= 0
  )
);
CREATE INDEX orders_status_created_idx ON orders (status, "createdAt");
CREATE INDEX orders_created_idx        ON orders ("createdAt");

CREATE TABLE order_items (
  id               TEXT PRIMARY KEY,
  "orderId"        TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "productId"      TEXT REFERENCES products(id),
  "menuNumber"     INTEGER,
  "nameSnapshot"   TEXT NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  "lineTotalCents" INTEGER NOT NULL,
  "vatRateBps"     INTEGER NOT NULL,
  notes            TEXT,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_items_qty_positive CHECK (quantity > 0)
);
CREATE INDEX order_items_order_idx ON order_items ("orderId");

CREATE TABLE order_item_modifiers (
  id                TEXT PRIMARY KEY,
  "orderItemId"     TEXT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  "modifierId"      TEXT REFERENCES modifiers(id),
  "nameSnapshot"    TEXT NOT NULL,
  "priceDeltaCents" INTEGER NOT NULL
);
CREATE INDEX order_item_modifiers_item_idx ON order_item_modifiers ("orderItemId");

CREATE TABLE order_events (
  id           TEXT PRIMARY KEY,
  "orderId"    TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "fromStatus" "OrderStatus",
  "toStatus"   "OrderStatus" NOT NULL,
  "actorType"  "ActorType" NOT NULL,
  "actorId"    TEXT,
  reason       TEXT,
  metadata     JSONB,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_created_idx ON order_events ("orderId", "createdAt");

-- ------------------------------------------------------------- PAYMENTS ---
CREATE TABLE payments (
  id                        TEXT PRIMARY KEY,
  "orderId"                 TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider                  TEXT NOT NULL DEFAULT 'stripe',
  "providerPaymentIntentId" TEXT UNIQUE,
  status                    "PaymentStatus" NOT NULL DEFAULT 'REQUIRES_PAYMENT',
  "amountAuthorizedCents"   INTEGER NOT NULL DEFAULT 0,
  "amountCapturedCents"     INTEGER NOT NULL DEFAULT 0,
  "amountRefundedCents"     INTEGER NOT NULL DEFAULT 0,
  currency                  TEXT NOT NULL DEFAULT 'EUR',
  "idempotencyKey"          TEXT UNIQUE,
  "authorizedAt"            TIMESTAMPTZ,
  "capturedAt"              TIMESTAMPTZ,
  "voidedAt"                TIMESTAMPTZ,
  "failureCode"             TEXT,
  "failureMessage"          TEXT,
  raw                       JSONB,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- You can never refund more than you captured.
  CONSTRAINT payments_refund_within_capture
    CHECK ("amountRefundedCents" <= "amountCapturedCents"),
  CONSTRAINT payments_amounts_nonneg CHECK (
    "amountAuthorizedCents" >= 0 AND "amountCapturedCents" >= 0
    AND "amountRefundedCents" >= 0
  )
);

CREATE TABLE payment_events (
  id           TEXT PRIMARY KEY,
  "paymentId"  TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  "fromStatus" "PaymentStatus",
  "toStatus"   "PaymentStatus",
  raw          JSONB,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_events_payment_created_idx ON payment_events ("paymentId", "createdAt");

-- ------------------------------------------------------------- DELIVERY ---
CREATE TABLE deliveries (
  id                     TEXT PRIMARY KEY,
  "orderId"              TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  provider               TEXT NOT NULL DEFAULT 'wolt',
  status                 "DeliveryStatus" NOT NULL DEFAULT 'QUOTED',
  "statusRank"           INTEGER NOT NULL DEFAULT 0,
  "shipmentPromiseId"    TEXT,
  "promiseValidUntil"    TIMESTAMPTZ,
  "quotedPriceCents"     INTEGER,
  "isBinding"            BOOLEAN,
  "woltOrderReferenceId" TEXT UNIQUE,
  "woltDeliveryId"       TEXT,
  "trackingUrl"          TEXT,
  "pickupEta"            TIMESTAMPTZ,
  "dropoffEta"           TIMESTAMPTZ,
  "distanceMetres"       INTEGER,
  "attemptCount"         INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode"        TEXT,
  "lastErrorAt"          TIMESTAMPTZ,
  raw                    JSONB,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Wolt Drive Agreement: max delivery distance is 10,000 m straight-line.
  CONSTRAINT deliveries_distance_within_max
    CHECK ("distanceMetres" IS NULL OR "distanceMetres" <= 10000)
);
CREATE INDEX deliveries_status_idx ON deliveries (status);

CREATE TABLE delivery_events (
  id             TEXT PRIMARY KEY,
  "deliveryId"   TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  "dispatchedAt" TIMESTAMPTZ,
  "receivedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw            JSONB
);
CREATE INDEX delivery_events_delivery_received_idx ON delivery_events ("deliveryId", "receivedAt");

-- ------------------------------------------------------- INFRASTRUCTURE ---
CREATE TABLE webhook_events (
  id                TEXT PRIMARY KEY,
  provider          TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType"       TEXT NOT NULL,
  payload           JSONB NOT NULL,
  "dispatchedAt"    TIMESTAMPTZ,
  "receivedAt"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "processedAt"     TIMESTAMPTZ,
  status            "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  error             TEXT,
  attempts          INTEGER NOT NULL DEFAULT 0,
  -- THE idempotency guarantee. A redelivered webhook is recognised here.
  CONSTRAINT webhook_events_provider_event_unique UNIQUE (provider, "providerEventId")
);
CREATE INDEX webhook_events_status_received_idx ON webhook_events (status, "receivedAt");

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  payload       JSONB NOT NULL,
  "runAfter"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts      INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  status        "JobStatus" NOT NULL DEFAULT 'PENDING',
  "lastError"   TEXT,
  "lockedAt"    TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completedAt" TIMESTAMPTZ
);
CREATE INDEX jobs_status_runafter_idx ON jobs (status, "runAfter");

CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  "actorType"  "ActorType" NOT NULL,
  "actorId"    TEXT,
  action       TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId"   TEXT,
  before       JSONB,
  after        JSONB,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entity_idx  ON audit_log ("entityType", "entityId");
CREATE INDEX audit_log_created_idx ON audit_log ("createdAt");

-- --------------------------------------- PROMOTIONS & DELIVERY PRICING ---
CREATE TABLE promotions (
  id                 TEXT PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  "discountType"     "DiscountType" NOT NULL,
  "discountValue"    INTEGER NOT NULL,
  "maxDiscountCents" INTEGER,
  "minOrderCents"    INTEGER NOT NULL DEFAULT 0,
  scope              "PromotionScope" NOT NULL DEFAULT 'BOTH',
  "firstOrderOnly"   BOOLEAN NOT NULL DEFAULT FALSE,
  "usageLimit"       INTEGER,
  "usageCount"       INTEGER NOT NULL DEFAULT 0,
  "perCustomerLimit" INTEGER,
  "validFrom"        TIMESTAMPTZ,
  "validTo"          TIMESTAMPTZ,
  "isActive"         BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"        TIMESTAMPTZ,
  CONSTRAINT promotions_usage_within_limit
    CHECK ("usageLimit" IS NULL OR "usageCount" <= "usageLimit")
);

CREATE TABLE promotion_redemptions (
  id              TEXT PRIMARY KEY,
  "promotionId"   TEXT NOT NULL REFERENCES promotions(id),
  "orderId"       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  "customerId"    TEXT,
  "discountCents" INTEGER NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Stops a single-use code being redeemed twice by two concurrent
  -- requests. An application-level check loses this race; this does not.
  CONSTRAINT promotion_redemptions_unique UNIQUE ("promotionId", "orderId")
);

CREATE TABLE delivery_pricing_rules (
  id          TEXT PRIMARY KEY,
  priority    INTEGER NOT NULL DEFAULT 0,
  "ruleType"  "DeliveryPricingRuleType" NOT NULL,
  config      JSONB NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE,
  "validFrom" TIMESTAMPTZ,
  "validTo"   TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX delivery_pricing_rules_active_priority_idx
  ON delivery_pricing_rules ("isActive", priority);

COMMIT;
