-- ============================================================================
-- Integrity constraints that Prisma cannot express
-- ============================================================================
-- WHY THIS FILE EXISTS
--
-- Prisma's schema language has no syntax for SQL CHECK constraints. So
-- `prisma db push` and `prisma migrate` create the tables, columns, foreign
-- keys and unique indexes — but silently omit every rule below.
--
-- That matters, because several of these are not stylistic niceties:
--
--   * products_alcohol_not_deliverable enforces a term of the signed Wolt
--     Drive Agreement (§2.2-2.3, no age-verification products on delivery).
--   * payments_refund_within_capture prevents refunding money never taken.
--   * deliveries_distance_within_max encodes the Agreement's 10km limit.
--
-- Application code checks these too. The database constraint is the backstop
-- for when application code is wrong, bypassed, or run concurrently — which
-- is exactly when the expensive mistakes happen.
--
-- RUN THIS AFTER EVERY `prisma db push` OR `prisma migrate deploy`.
-- It is idempotent: re-running it is a no-op, so it is safe to run always.
-- ============================================================================

-- PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS", so each block checks
-- pg_constraint first. Verbose, but explicit and safe to re-run.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_hours_range_valid') THEN
    ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_range_valid
      CHECK ("opensAt" >= 0 AND "opensAt" <= 1440);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_hours_close_valid') THEN
    ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_close_valid
      CHECK ("closesAt" >= 0 AND "closesAt" <= 1440);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_hours_order_valid') THEN
    ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_order_valid
      CHECK ("isClosed" OR "closesAt" > "opensAt");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'opening_hours_dow_valid') THEN
    ALTER TABLE opening_hours ADD CONSTRAINT opening_hours_dow_valid
      CHECK ("dayOfWeek" BETWEEN 0 AND 6);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_nonneg') THEN
    ALTER TABLE products ADD CONSTRAINT products_price_nonneg
      CHECK ("priceCents" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_vat_valid') THEN
    ALTER TABLE products ADD CONSTRAINT products_vat_valid
      CHECK ("vatRateBps" >= 0 AND "vatRateBps" <= 10000);
  END IF;
END $$;

-- Wolt Drive Agreement §2.2-2.3: products requiring age verification may not
-- be delivered. Enforced here so no future code path can quietly re-enable it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_alcohol_not_deliverable') THEN
    ALTER TABLE products ADD CONSTRAINT products_alcohol_not_deliverable
      CHECK (NOT ("containsAlcohol" AND "deliveryEligible"));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'modifier_groups_select_valid') THEN
    ALTER TABLE modifier_groups ADD CONSTRAINT modifier_groups_select_valid
      CHECK ("maxSelect" >= "minSelect" AND "minSelect" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_needs_address') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_needs_address
      CHECK (
        "fulfilmentType" <> 'DELIVERY'
        OR status IN ('DRAFT', 'PENDING_PAYMENT')
        OR ("deliveryLine1" IS NOT NULL AND "deliveryCity" IS NOT NULL)
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_totals_nonneg') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_totals_nonneg
      CHECK (
        "subtotalCents" >= 0 AND "discountCents" >= 0
        AND "customerDeliveryFeeCents" >= 0 AND "totalCents" >= 0
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_qty_positive') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_qty_positive
      CHECK (quantity > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_refund_within_capture') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_refund_within_capture
      CHECK ("amountRefundedCents" <= "amountCapturedCents");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amounts_nonneg') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_amounts_nonneg
      CHECK (
        "amountAuthorizedCents" >= 0 AND "amountCapturedCents" >= 0
        AND "amountRefundedCents" >= 0
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deliveries_distance_within_max') THEN
    ALTER TABLE deliveries ADD CONSTRAINT deliveries_distance_within_max
      CHECK ("distanceMetres" IS NULL OR "distanceMetres" <= 10000);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotions_usage_within_limit') THEN
    ALTER TABLE promotions ADD CONSTRAINT promotions_usage_within_limit
      CHECK ("usageLimit" IS NULL OR "usageCount" <= "usageLimit");
  END IF;
END $$;

-- Report what is now in place.
SELECT conname AS constraint_name, conrelid::regclass AS table_name
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;
