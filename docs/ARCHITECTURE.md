# HAT GAO — Direct Ordering System
## Architecture & Technical Analysis (v1.1)

**Prepared for:** Tan, HAT GAO Vietnamese Restaurant, Nicosia, Cyprus
**Date:** 19 August 2026
**Status:** For review. No application code has been written.

> **v1.1 — updated after reading the signed Wolt Drive API Service Agreement.**
> Wolt Drive pricing is now confirmed rather than assumed; the Data Processing Agreement is in hand; and several contract clauses have become concrete build requirements (Wolt checkout branding, a delivery kill-switch, prep-time management to avoid the Lateness Fee, per-product delivery eligibility for alcohol).
> Full detail lives in the companion document **"Wolt Drive API Service Agreement — Technical & Commercial Analysis"**, which should be read alongside this one. Changes are marked **[v1.1]** below.

---

### How to read this document

Sections A–I are design. Section J is the plan. Sections K and L are the two you should read most carefully — K is what I need from you before we can start, and L is where I tell you what I think could actually go wrong.

Everything I state about the **Wolt Drive API** in this document is taken from Wolt's official developer documentation and is marked as *verified*. Anything I could not confirm from the docs is marked **[NEEDS CONFIRMATION FROM WOLT]**. I have not invented a single endpoint, field or parameter.

Your four answers are baked in: WordPress marketing site, Stripe, kitchen tablet dashboard, managed hosting.

---

## A. Recommended technology stack

### A.1 The recommendation

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | One language for frontend and backend. Types catch the class of bug that costs you real money here — wrong price, wrong currency unit, missing field. |
| Framework | **Next.js (App Router)** | Customer site, admin dashboard and API all in one deployable app. One repo, one deploy, one auth system. For a solo developer this is the single biggest productivity decision. |
| Database | **PostgreSQL** | You need real transactions, real constraints and real foreign keys for money and orders. Postgres also gives us JSONB for storing raw Wolt/Stripe payloads, which we will want. |
| DB access | **Prisma** | Typed queries, a proper migration system, readable schema file. Slightly more magic than raw SQL, but the migration tooling alone justifies it for a solo maintainer. |
| Validation | **Zod** | Every input from the browser and every webhook payload gets parsed and validated at the boundary. Non-negotiable. |
| Styling / UI | **Tailwind CSS + shadcn/ui** | Fast, mobile-first, and you own the component code rather than fighting a component library's opinions. |
| Auth | **Auth.js (NextAuth)** | Staff login with sessions; later, customer accounts. Battle-tested cookie/session handling — do not hand-roll this. |
| Payments | **Stripe** (Payment Element, manual capture) | See A.4. |
| Delivery | **Wolt Drive API** | Only provider for V1, isolated behind one module. |
| Hosting | **Vercel (Frankfurt `fra1`) + Neon Postgres (EU region)** | Managed, automatic HTTPS, automatic backups, EU data residency for GDPR. |
| File/image storage | **Cloudflare R2 or Vercel Blob** | Menu photos. Cheap, CDN-backed. |
| Email | **Resend** or **Postmark** | Order confirmations, staff alerts. Transactional email needs a real provider or it lands in spam. |
| Error monitoring | **Sentry** | You will not be watching logs at 21:00 on a Saturday. Sentry will tell you. |
| Background jobs | **Postgres-backed job table + scheduled worker** | See A.5. Deliberately boring. |

### A.2 Why one Next.js app instead of separate frontend and backend

A separate React frontend and a separate Node/Express API is the "proper" architecture you will read about online. For this project it is the wrong choice. It doubles the deployment surface, doubles the auth complexity (you'd need tokens instead of cookies), and forces you to maintain a shared type contract by hand. You are one person maintaining a restaurant's revenue channel. A well-structured monolith is the correct engineering decision here, not a compromise.

The important discipline is *internal* separation: all business logic lives in a `src/server/` layer that knows nothing about HTTP. The API routes are thin. That means if you ever do need to split out a service, the logic is already portable.

### A.3 How this fits your existing WordPress site

We do **not** touch WordPress. It keeps doing what it does — marketing pages, story, photos, contact, SEO.

```
hatgaocy.com           → WordPress (unchanged)
order.hatgaocy.com     → the new ordering app (Next.js on Vercel)
```

The WordPress site gets a prominent "Order Online" button pointing at the subdomain. This is exactly how GloriaFood works today, so it is not a downgrade in customer experience, and it means a WordPress plugin update can never take down your ordering system.

**One thing to watch:** the ordering app must carry HAT GAO's branding closely enough that customers don't feel they've been thrown to a third party mid-purchase. Same logo, same colours, same fonts. We'll pull those from the existing site.

*Alternative considered:* embedding the ordering app in WordPress via an iframe. Rejected — iframes break mobile scrolling, break payment redirects, break analytics, and break the back button. Subdomain is the right call.

### A.4 Payments: Stripe, and one important design decision

Stripe is fully available for Cypriot businesses. We'll use **Stripe Payment Element** embedded in our own checkout page — the card fields are Stripe-hosted iframes, so card numbers never touch your server, which keeps you in the lightest PCI compliance category (SAQ-A). Apple Pay and Google Pay come along for free, which matters a lot for mobile conversion.

**The decision that matters: authorize now, capture later.**

There are two ways to take the money:

1. **Capture immediately.** Money moves at checkout. If the restaurant then rejects the order, or Wolt can't create the delivery, you must issue a refund. Refunds take days to reach the customer, generate support calls, and in some cases cost you the processing fee anyway.

2. **Authorize at checkout, capture on acceptance.** Stripe places a hold on the customer's card. The money only actually moves when the restaurant accepts the order *and* the Wolt delivery has been successfully created. If anything fails, we **void** the authorization — the hold disappears, usually within a day or two, no refund, no fee, no chargeback risk.

**I strongly recommend option 2.** It is the single cleanest solution to the problem you correctly identified in your brief: *"successful payments where delivery creation fails."* With manual capture, that scenario stops being a financial incident and becomes a cancelled hold.

Trade-offs you should know:
- Authorizations expire (Stripe's window for card authorizations is limited — we must capture well within it). Since your kitchen accepts orders within minutes, this is a non-issue in practice, but the system will enforce a timeout.
- The customer sees a pending charge on their statement immediately. Some customers find this confusing. We handle it with clear wording at checkout: *"Your card will be charged when the restaurant confirms your order."*
- Not every payment method supports delayed capture. Cards, Apple Pay and Google Pay do. If we later add something like Klarna, that path may need immediate capture. We'll design for that.

### A.5 Background jobs — why we need them and why we're keeping them boring

Several things must happen reliably even if the person's browser is closed and even if an external API is down:
- Creating the Wolt delivery (retry on 5xx)
- Capturing the Stripe payment
- Voiding an authorization after a rejection
- Sending confirmation emails
- Escalating an order the kitchen hasn't acknowledged
- Reconciling delivery status if webhooks go quiet

The tempting answer is Redis + BullMQ + a worker service. That's three more moving parts to operate. Instead:

**A `jobs` table in Postgres, plus a scheduled tick that runs every minute.** Each job row has a type, a payload, a `run_after` timestamp, an attempt count and a status. The tick claims due jobs with `SELECT ... FOR UPDATE SKIP LOCKED` (Postgres handles the concurrency correctly), runs them, and reschedules failures with exponential backoff. Failed-permanently jobs land in a dead-letter state and alert you.

This is a few hundred lines of code, has no new vendor, survives restarts, and is inspectable with a SQL query when something goes wrong. For your volume it will never be the bottleneck.

**One hosting caveat:** Vercel's cron scheduling on the free tier is too infrequent for this; minute-level crons require the paid tier (verify current limits when we set up — Vercel changes them). If you'd rather not pay for that, **Railway** runs the identical codebase as a persistent Node process where the worker is just a loop. We will not write any Vercel-specific code, so switching is a config change, not a rewrite.

### A.6 What I am deliberately NOT using

- **No microservices.** One app.
- **No Kubernetes/Docker orchestration.** Managed platform.
- **No GraphQL.** REST-ish route handlers are enough and easier to debug.
- **No second delivery provider.** As you said. The Wolt module has a clean internal interface, and that is where the modularity ends.
- **No custom payment form.** Stripe's.
- **No WebSockets for the kitchen dashboard.** Polling every 5 seconds is more robust on serverless, easier to debug, and indistinguishable to the user. WebSockets here would be an over-engineered failure point.

---

## B. System architecture

### B.1 Component map

```
┌──────────────────┐        ┌────────────────────────────────────┐
│  hatgaocy.com    │        │        CUSTOMER (mobile web)       │
│   WordPress      │──────► │     order.hatgaocy.com             │
│  (marketing)     │  link  │     Next.js customer app           │
└──────────────────┘        └───────────────┬────────────────────┘
                                            │ HTTPS (session cookie)
                                            ▼
                     ┌───────────────────────────────────────────┐
                     │       NEXT.JS APPLICATION (Vercel, EU)    │
                     │                                           │
                     │  /api/public/*   customer endpoints       │
                     │  /api/admin/*    staff endpoints (authz)  │
                     │  /api/webhooks/* Stripe + Wolt receivers  │
                     │  /api/internal/* cron tick (secret token) │
                     │                                           │
                     │  ┌─────────────────────────────────────┐  │
                     │  │  src/server/  — ALL business logic  │  │
                     │  │  pricing · orders · payments ·      │  │
                     │  │  delivery · promos · state machines │  │
                     │  └─────────────────────────────────────┘  │
                     └───┬──────────┬──────────┬─────────────┬───┘
                         │          │          │             │
              ┌──────────▼──┐  ┌────▼─────┐ ┌──▼──────────┐ ┌▼────────────┐
              │  Postgres   │  │  Stripe  │ │ Wolt Drive  │ │  Email      │
              │  (Neon, EU) │  │   API    │ │    API      │ │  (Resend)   │
              │             │  │          │ │             │ │             │
              │ orders      │  │ Payment  │ │ shipment-   │ │ confirms    │
              │ payments    │  │ Intents  │ │ promises    │ │ receipts    │
              │ deliveries  │  │          │ │ deliveries  │ │             │
              │ jobs        │  └────┬─────┘ └──────┬──────┘ └─────────────┘
              │ webhook_    │       │              │
              │  events     │       │ webhooks     │ webhooks (JWT HS256)
              └─────────────┘       └──────────────┘
                         ▲                    │
                         │                    ▼
                     ┌───┴────────────────────────────┐
                     │  KITCHEN TABLET                │
                     │  order.hatgaocy.com/admin      │
                     │  polls every 5s · audio alert  │
                     └────────────────────────────────┘
```

### B.2 The happy path, step by step

1. **Browse.** Customer opens `order.hatgaocy.com` on their phone. Menu is served from our database, cached at the edge.
2. **Cart.** Items and modifiers held in browser state (and mirrored to a server-side cart row once they start checkout, so we can recover abandoned carts later).
3. **Address & availability.** Customer enters a delivery address. We geocode it, then call Wolt's **`POST /v1/venues/{venue_id}/shipment-promises`** with the dropoff location. Wolt returns a `price`, an `eta_minutes`, a promise `id` and a `valid_until` timestamp. We store the raw response.
4. **Fee calculation.** Our own **delivery pricing rules** (Section B.4) turn Wolt's cost into the fee the *customer* actually sees. These are different numbers and the system must always know both.
5. **Checkout.** Customer enters name, phone, notes. We **recalculate the entire order total server-side** from database prices — the browser's numbers are never trusted. We create a Stripe PaymentIntent with `capture_method: manual` for that server-computed amount.
6. **Payment authorized.** Customer completes 3D Secure if their bank requires it. Stripe fires `payment_intent.amount_capturable_updated` to our webhook. We verify the signature, mark the payment `AUTHORIZED`, transition the order to `PLACED`, and enqueue a "notify kitchen" job.
7. **Kitchen alert.** The tablet's poll picks up the new order within 5 seconds and starts an audible alarm that will not stop until a human presses Accept or Reject.
8. **Accept.** Staff press Accept and pick a preparation time (e.g. 20 minutes). This single action triggers, inside one database transaction plus queued jobs:
   - order → `ACCEPTED`
   - a **fresh** Wolt shipment promise is requested (the checkout one has likely expired — `valid_until` is short)
   - **`POST /v1/venues/{venue_id}/deliveries`** is called with that new `shipment_promise_id`, the recipient details, the parcels, and `min_preparation_time_minutes` set from the staff's estimate
   - on success, we store `wolt_order_reference_id` and `tracking.url`
   - the Stripe payment is **captured**
9. **Cooking.** Staff move the order to `PREPARING` then `READY`. Meanwhile Wolt webhooks (`order.pickup_eta_updated`, `order.pickup_started`, `order.picked_up`, `order.dropoff_started`, `order.delivered`) update the delivery record independently.
10. **Customer tracking.** The customer's order status page shows our order status plus, once available, Wolt's `tracking.url`.
11. **Delivered.** `order.delivered` webhook → delivery `DELIVERED` → order `COMPLETED`.

### B.3 The unhappy paths (this is where systems actually earn their keep)

| Failure | What the system does |
|---|---|
| Wolt says the address is outside the delivery area at checkout | Never let the customer pay. Show "we don't deliver there yet" and offer pickup. Error code: `DROPOFF_OUTSIDE_OF_DELIVERY_AREA`. |
| Payment authorization fails | Order stays `PENDING_PAYMENT`, no kitchen notification, customer can retry. Nothing is created downstream. |
| Kitchen doesn't respond within N minutes | Escalation job: louder alert, then email/SMS to your phone. Configurable. After a hard timeout, auto-void the authorization and notify the customer. Never leave a customer's money on hold with no food coming. |
| Restaurant rejects | Void the authorization. Notify customer with the reason. No Wolt delivery was ever created, so nothing to cancel. |
| Wolt delivery creation fails at acceptance (area closed, 5xx, etc.) | The payment is **still only authorized, not captured.** Retry job runs with exponential backoff (docs: max 5 retries for 5xx, do not retry 4xx). If it permanently fails, alert staff with two choices: convert to pickup/self-delivery, or cancel and void the hold. **Money never moved.** |
| Payment capture fails after delivery is created | Rare (an authorized card usually captures) but must be handled: order proceeds, payment flagged `CAPTURE_FAILED`, you are alerted, order appears in an "unpaid" report. Never withhold food the customer is expecting because of a back-office problem — chase the money separately. |
| Wolt webhooks stop arriving | A reconciliation job flags any delivery stuck in a non-terminal state for too long and alerts you. **[NEEDS CONFIRMATION FROM WOLT]** — the public docs show no polling endpoint to fetch a delivery's current status, only webhooks. This is an important gap to raise with your account manager. |
| Duplicate webhook delivery | Every inbound webhook is written to a `webhook_events` table with a unique constraint on the provider event ID **before** processing. A duplicate is recognised and discarded. |
| Customer double-clicks "Pay" | Idempotency key on the PaymentIntent + a unique constraint on the order. One order, one payment, always. |
| Duplicate Wolt delivery | Our order ID is sent as the merchant reference; a unique constraint on `deliveries.order_id` means we physically cannot create two. Wolt also returns `DUPLICATE_ORDER` as a safety net. |

### B.4 Delivery pricing — configurable, never hardcoded

You were right to call this out. There are always **two numbers**:

- **`wolt_cost`** — what Wolt Drive charges you, from the shipment promise `price`.
- **`customer_delivery_fee`** — what the customer pays, computed by *your* rules.

The difference is your **subsidy** (or, occasionally, your margin). Every order stores all three, so your analytics can answer the only question that matters: *are direct orders actually more profitable than Wolt marketplace orders?*

The rules engine is a small, ordered list of configurable rules in the admin dashboard. Something like:

| Rule type | Example configuration |
|---|---|
| Flat fee | Customer always pays €2.50 regardless of Wolt's cost |
| Pass-through | Customer pays exactly Wolt's cost |
| Capped pass-through | Customer pays Wolt's cost, capped at €4.00; you absorb the rest |
| Free above threshold | Order ≥ €30 → customer pays €0 |
| Tiered by order value | < €20 → €3.50 · €20–35 → €2.00 · ≥ €35 → free |
| Distance guard | If Wolt's cost > €8.00, refuse the order entirely (protects you from a €40 order that costs €9 to deliver) |
| Minimum order value | Below €15, delivery not offered |

Critically, the admin UI should show you, live: *"With these rules, an average order of €28 at 3km costs you €X in subsidy."* You are optimising for profit, not volume — the tool should tell you the profit consequence before you save.

---

## C. Database architecture

Design principles first, because they matter more than the table list:

1. **Money is stored as integers in cents.** `amount_cents INTEGER`, plus a `currency CHAR(3)`. Never floats. A rounding error in a price calculation is a real financial bug.
2. **Order lines snapshot their prices.** When an order is placed we copy the product name, price and modifier prices into the order line. If you raise a price tomorrow, last week's orders must not change.
3. **Raw provider payloads are kept.** Every Stripe and Wolt response goes into a JSONB column. When something goes wrong at 20:00 on a Friday, the raw payload is the difference between five minutes of debugging and an hour.
4. **Soft-delete menu items, never hard-delete.** Order history references them forever.
5. **State transitions are logged, not just stored.** An `order_events` table gives you a full audit trail of who changed what and when.

### C.1 Entity map

```
                          ┌──────────────┐
                          │   settings   │  (single row: venue config,
                          └──────────────┘   opening hours, prep times,
                                             Wolt venue_id, feature flags)
  ┌───────────┐      ┌────────────┐
  │ categories│◄─────┤  products  │──┐
  └───────────┘      └────────────┘  │
                            │        │  ┌──────────────────────┐
                            │        └─►│ product_modifier_    │
                            │           │      groups          │
                            │           └──────────┬───────────┘
                            │                      ▼
                            │           ┌──────────────────────┐
                            │           │   modifier_groups    │
                            │           └──────────┬───────────┘
                            │                      ▼
                            │           ┌──────────────────────┐
                            │           │      modifiers       │
                            │           └──────────────────────┘
                            │
  ┌───────────┐             │
  │ customers │──┐          │
  └─────┬─────┘  │          │
        │        ▼          ▼
        │  ┌─────────────────────────┐      ┌──────────────────┐
        │  │         orders          │─────►│   order_items    │
        │  │  (order_status,         │      └────────┬─────────┘
        │  │   fulfilment_type,      │               ▼
        │  │   totals, subsidy)      │      ┌──────────────────┐
        │  └───┬───────┬─────────┬───┘      │ order_item_      │
        │      │       │         │          │   modifiers      │
        │      ▼       ▼         ▼          └──────────────────┘
        │  ┌────────┐ ┌────────┐ ┌──────────────┐
        │  │payments│ │deliver-│ │ order_events │
        │  └───┬────┘ │  ies   │ └──────────────┘
        │      │      └───┬────┘
        │      ▼          ▼
        │  ┌────────┐ ┌──────────────────┐
        │  │payment_│ │ delivery_events  │
        │  │ events │ └──────────────────┘
        │  └────────┘
        ▼
  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐
  │  addresses   │   │  promotions  │   │ delivery_pricing_    │
  └──────────────┘   └──────┬───────┘   │       rules          │
                            ▼           └──────────────────────┘
                   ┌──────────────────┐
                   │promotion_        │   ┌──────────────┐  ┌────────┐
                   │  redemptions     │   │webhook_events│  │  jobs  │
                   └──────────────────┘   └──────────────┘  └────────┘

  ┌──────────────┐   ┌──────────────┐
  │ staff_users  │   │  audit_log   │
  └──────────────┘   └──────────────┘
```

### C.2 Table detail (the ones with subtlety)

**`orders`** — the spine.
- `id` (UUID), `order_number` (short human code, e.g. `HG-4821`, unique — staff will read this aloud)
- `status` (order state machine, Section D)
- `fulfilment_type` — `DELIVERY` | `PICKUP`
- `customer_id` (nullable — guest checkout), `customer_name`, `customer_phone`, `customer_email` snapshotted
- `delivery_address_*` fields snapshotted, plus `lat`/`lon` and `delivery_instructions`
- `subtotal_cents`, `discount_cents`, `customer_delivery_fee_cents`, `wolt_cost_cents`, `subsidy_cents`, `total_cents`, `currency`
- `scheduled_for` (nullable — pre-orders, later phase)
- `promised_ready_at`, `accepted_at`, `prep_minutes`
- `notes`, `rejection_reason`
- timestamps + `version` (optimistic locking, so two staff can't accept the same order twice)

**`payments`** — one row per order, own lifecycle.
- `order_id` (unique), `provider` (`stripe`), `provider_payment_intent_id` (unique), `status` (payment state machine, Section E), `amount_authorized_cents`, `amount_captured_cents`, `amount_refunded_cents`, `idempotency_key`, `raw` JSONB

**`deliveries`** — one row per delivery order, own lifecycle.
- `order_id` (unique — this constraint is your protection against duplicate deliveries), `provider` (`wolt`), `status` (delivery state machine, Section F)
- `shipment_promise_id`, `promise_valid_until`, `quoted_price_cents`
- `wolt_order_reference_id`, `wolt_delivery_id`, `tracking_url`
- `pickup_eta`, `dropoff_eta`, `attempt_count`, `last_error_code`, `raw` JSONB

**`webhook_events`** — the inbox pattern.
- `provider`, `provider_event_id` (**unique index — this is the idempotency guarantee**), `event_type`, `payload` JSONB, `dispatched_at`, `received_at`, `processed_at`, `status`, `error`
- Every webhook is *stored first, processed second*. If processing crashes, the event is still on disk and can be replayed.

**`jobs`** — the outbox pattern.
- `type`, `payload` JSONB, `run_after`, `attempts`, `max_attempts`, `status`, `last_error`, `locked_at`
- Index on `(status, run_after)`.

**`delivery_pricing_rules`** — ordered, configurable, versioned.
- `priority`, `rule_type`, `config` JSONB, `active`, `valid_from`, `valid_to`
- Versioned so you can see which rules were in force when an old order was priced.

**`modifier_groups` / `modifiers`** — the part people underestimate.
- Groups have `min_select`, `max_select`, `required`. This models "choose exactly 1 spice level" and "choose up to 3 extras" with the same structure.
- Modifiers have their own `price_delta_cents` and `available` flag.
- A group can be shared across products (spice level applies to many dishes) — hence the join table.

---

## D. Order state machine

The order state machine tracks **the restaurant's fulfilment of food**. It deliberately does not know about card networks or couriers.

```
                      ┌──────────┐
                      │  DRAFT   │ cart exists, nothing committed
                      └────┬─────┘
                           │ customer starts checkout
                           ▼
                  ┌──────────────────┐
                  │ PENDING_PAYMENT  │──── payment failed / abandoned ──┐
                  └────────┬─────────┘                                  │
                           │ payment AUTHORIZED                         │
                           ▼                                            ▼
                     ┌──────────┐                                 ┌───────────┐
        ┌────────────┤  PLACED  │────────────┐                    │ ABANDONED │
        │            └──────────┘            │                    └───────────┘
        │ staff reject          staff accept │
        ▼                                    ▼
  ┌──────────┐                        ┌────────────┐
  │ REJECTED │                        │  ACCEPTED  │  Wolt delivery created,
  └──────────┘                        └─────┬──────┘  payment captured
        │                                   │
        │                                   ▼
        │                            ┌────────────┐
        │                            │ PREPARING  │
        │                            └─────┬──────┘
        │                                  ▼
        │                            ┌────────────┐
        │                            │   READY    │
        │                            └─────┬──────┘
        │                    ┌─────────────┴──────────────┐
        │           DELIVERY │                            │ PICKUP
        │                    ▼                            ▼
        │        ┌──────────────────────┐      ┌────────────────────┐
        │        │  OUT_FOR_DELIVERY    │      │ AWAITING_PICKUP    │
        │        └──────────┬───────────┘      └─────────┬──────────┘
        │                   └──────────┬─────────────────┘
        │                              ▼
        │                       ┌─────────────┐
        │                       │  COMPLETED  │
        │                       └─────────────┘
        │
        └──────────► ┌───────────┐        ┌────────┐
                     │ CANCELLED │        │ FAILED │ (unrecoverable; alerts you)
                     └───────────┘        └────────┘
```

**Rules enforced in code, not by convention:**

- Transitions are defined in a single `ORDER_TRANSITIONS` map. Any transition not in the map throws. This prevents an entire category of bug where some route handler quietly sets a status it shouldn't.
- `PLACED` is only reachable from a **verified Stripe webhook**, never from the browser saying "I paid".
- `ACCEPTED` is the atomic pivot: it must result in *both* a created delivery and a captured payment, or the order must not sit silently half-done. We do this by transitioning to `ACCEPTED` immediately (so the kitchen can start cooking) and enqueuing the delivery+capture as jobs that are guaranteed to run to completion or alert.
- `CANCELLED` after `ACCEPTED` requires a Wolt cancellation attempt (`PATCH /order/{wolt_order_reference_id}/status/cancel`) plus a refund decision. Per Wolt's docs, cancellation is only possible until a courier accepts and starts the pickup task — after that the delivery cannot be cancelled via API and you'll have a courier arriving for food you cancelled. The admin UI must warn staff of exactly this before they confirm.
- Every transition writes an `order_events` row with actor, from-state, to-state, reason and timestamp.

---

## E. Payment state machine

Kept entirely separate, as you asked. This tracks **money**, and only money.

```
     ┌───────────────────┐
     │ REQUIRES_PAYMENT  │
     └─────────┬─────────┘
               │ PaymentIntent created (capture_method: manual)
               ▼
     ┌───────────────────┐
     │    PROCESSING     │  customer is in 3DS / bank confirmation
     └────┬─────────┬────┘
          │         │
   failed │         │ payment_intent.amount_capturable_updated
          ▼         ▼
   ┌──────────┐  ┌──────────────┐
   │  FAILED  │  │  AUTHORIZED  │  funds held, NOT taken
   └──────────┘  └──┬────────┬──┘
                    │        │
      restaurant    │        │ restaurant accepts
      rejects /     │        │ + delivery created
      timeout       │        ▼
                    │   ┌───────────┐
                    │   │ CAPTURED  │  money is yours
                    │   └─────┬─────┘
                    │         │
                    ▼         ├────────────────────┐
              ┌─────────┐     ▼                    ▼
              │ VOIDED  │  ┌────────────────┐ ┌──────────┐
              │ (hold   │  │PARTIALLY_      │ │ REFUNDED │
              │ released│  │  REFUNDED      │ │          │
              └─────────┘  └────────────────┘ └──────────┘

              ┌────────────────┐
              │ CAPTURE_FAILED │ ← alerts you; order still proceeds
              └────────────────┘
```

**Key points:**

- Every state change originates from a **signature-verified Stripe webhook**, not from our own API call's return value. Stripe's webhook is the source of truth; our synchronous call result is only a hint. This is what makes the system correct when a request times out but actually succeeded.
- `VOIDED` is the state that makes the whole design safe. It is a *non-event* for the customer — no refund, no fee, hold drops off.
- Refunds are separate from voids and are used only after capture (customer complaint, missing item, failed delivery).
- Partial refunds are supported from day one in the data model, even if the admin UI only exposes them in a later phase — retrofitting partial refunds into a schema that assumed all-or-nothing is painful.

---

## F. Delivery state machine

Separate again, and this one is driven almost entirely by Wolt webhooks.

```
  ┌──────────────┐
  │ NOT_REQUIRED │  (pickup orders — no Wolt involvement at all)
  └──────────────┘

  ┌──────────┐
  │  QUOTED  │  shipment promise obtained at checkout (has valid_until)
  └────┬─────┘
       │ restaurant accepts → fresh promise → create delivery
       ▼
  ┌──────────────────┐        creation failed permanently
  │ CREATION_PENDING │───────────────────────────────┐
  └────────┬─────────┘                               ▼
           │ 201 from POST /deliveries      ┌──────────────────┐
           ▼                                │ CREATION_FAILED  │
  ┌──────────────────┐                      └──────────────────┘
  │     CREATED      │  order.received       (alerts staff, payment
  │  (INFO_RECEIVED) │                        still only authorized)
  └────────┬─────────┘
           │ order.pickup_started
           ▼
  ┌──────────────────┐
  │  PICKUP_STARTED  │  courier en route to restaurant
  └────────┬─────────┘  (order.pickup_arrival, order.pickup_eta_updated)
           │ order.picked_up
           ▼
  ┌──────────────────┐
  │    PICKED_UP     │
  └────────┬─────────┘
           │ order.dropoff_started
           ▼
  ┌──────────────────┐
  │ DROPOFF_STARTED  │  (order.dropoff_arrival, order.dropoff_eta_updated)
  └────────┬─────────┘
           │ order.delivered / order.dropoff_completed
           ▼
  ┌──────────────────┐
  │    DELIVERED     │
  └──────────────────┘

  Exceptional:
  ┌───────────┐  ┌──────────┐  ┌───────────────────┐
  │ CANCELLED │  │ REJECTED │  │ CUSTOMER_NO_SHOW  │
  └───────────┘  └──────────┘  └───────────────────┘
   (our cancel)   (order.       (order.customer_no_show —
                   rejected)     optional subscription)
```

**Verified Wolt event types** (from the official webhook documentation):

*Auto-subscribed:* `order.received`, `order.rejected`, `order.pickup_eta_updated`, `order.pickup_started`, `order.picked_up`, `order.pickup_arrival`, `order.dropoff_started`, `order.dropoff_arrival`, `order.dropoff_completed`, `order.delivered`, `order.dropoff_eta_updated`, `order.handshake_delivery`

*Optional:* `order.customer_no_show`, `order.location_updated` (Wolt's docs explicitly warn this one generates heavy load — we will **not** subscribe to it in V1; live courier position on a map is a phase-2 nicety, not a V1 requirement).

**The critical implementation detail — out-of-order events.**

Wolt's documentation states plainly: *"Events that are triggered by the same action... may be sent at seemingly random order."*

So we must **never** apply a webhook by blindly setting the status. Instead each delivery state gets a numeric rank, and the handler only advances the state if the incoming event's rank is *higher* than the current one. A late-arriving `order.pickup_started` cannot drag a delivery back from `DELIVERED`. We also record `dispatched_at` from the payload and use it as a secondary guard. Every event is stored in `delivery_events` regardless, so nothing is lost.

**Also note:** Wolt's docs say to wait for the first `order.pickup_eta_updated` event before treating the pickup ETA as reliable. Our UI must not show an ETA to staff or customers before that.

---

## G. Wolt Drive integration architecture

Everything in this section is taken from Wolt's official developer documentation. I have flagged the gaps.

### G.1 Verified facts from the official documentation

**Base URLs**
- Development: `https://daas-public-api.development.dev.woltapi.com`
- Production: `https://daas-public-api.wolt.com`

**Authentication**
- `Authorization: Bearer <token>` header, using a Merchant Key issued by Wolt.

**Two integration models — and which one we want**

Wolt documents two flows:

| | Venueful (**recommended by Wolt, and by me**) | Venueless |
|---|---|---|
| Concept | Your restaurant is pre-registered as a *venue* in Wolt's system | You send pickup details on every request |
| Quote | `POST /v1/venues/{venue_id}/shipment-promises` | `POST /merchants/{merchant_id}/delivery-fee` |
| Create | `POST /v1/venues/{venue_id}/deliveries` | `POST /merchants/{merchant_id}/delivery-order` |
| Intended for | Fixed physical locations — exactly you | Retailers with many low-volume locations |

**We should use the venueful flow.** You have one fixed kitchen. It's what Wolt recommends and it means your address, opening hours and pickup instructions are configured once on Wolt's side rather than repeated in every API call.

**Endpoints we will use**

| Purpose | Method & path |
|---|---|
| Quote price + ETA | `POST /v1/venues/{venue_id}/shipment-promises` |
| Create delivery | `POST /v1/venues/{venue_id}/deliveries` |
| Cancel delivery | `PATCH /order/{wolt_order_reference_id}/status/cancel` (requires a `reason`) |
| Register webhook | `POST /v1/merchants/{merchant_id}/webhooks` |
| Delivery area polygons | `GET /merchants/{merchant_id}/delivery-areas` — docs note this requires a token created after November 2025 |
| Handshake PIN (if used) | `GET /order/{wolt_order_reference_id}/handshake-delivery` |

**Shipment promise response fields (verified):** `id`, `created_at`, `valid_until`, `pickup` (venue_id, location, options incl. `min_preparation_time_minutes`, `eta_minutes`), `dropoff` (location, options, `eta_minutes`), `price` (amount, currency), `is_binding`, `parcels`. (`time_estimate_minutes` is documented as deprecated — we won't use it.)

**Delivery response fields (verified):** `id`, `status`, `wolt_order_reference_id`, `merchant_order_reference_id`, `order_number`, `tracking` (id, url), `pickup`, `dropoff`, `price`, `recipient` (name, phone_number, email), `parcels`, `customer_support`, `tips`.

**Two fields deserve special attention:**
- `valid_until` — shipment promises **expire**. We must treat a promise as a short-lived quote, not a contract. Our flow re-quotes at acceptance time for exactly this reason.
- `is_binding` — a boolean indicating whether an order can actually be created from this promise. We must check it before showing a customer a "delivery available" result.

### G.2 Webhooks — verified mechanics

- Registration is **at merchant level**: all venues under the merchant post to the same endpoint. Since you have one venue, this is fine.
- The payload arrives as `{"token": "<HS256-encoded JWT>"}`.
- You supply a `client_secret` at registration; that secret is the JWT signing key. We verify the HS256 signature to prove the event really came from Wolt. The docs note the signature is **not base64 encoded**.
- Decoded events carry `dispatched_at` (ISO 8601), `type`, and `details`.
- Retry behaviour is configurable at registration: `retry_delay = base^n`, where you specify `exponent_base` and `max_retry_count`.
- Two event types (`order.location_updated`, `order.handshake_delivery`) have distinct payload shapes.

**Our webhook handler will therefore:**
1. Accept the POST and read the `token` field.
2. Verify the HS256 signature against our stored `client_secret`. Reject with 401 if invalid — **never** process an unverified event.
3. Insert into `webhook_events` with a unique constraint on the event identifier. On conflict, return 200 immediately (already seen).
4. Return **200 fast** — before doing any real work. Wolt retries on non-2xx, and slow handlers cause duplicate deliveries of events.
5. Enqueue a job to actually apply the state change, using the rank-based ordering guard from Section F.

### G.3 Error handling — verified rules

| Status | Action (per Wolt's documentation) |
|---|---|
| 2xx | Success |
| 400 | Do not retry — payload or availability problem |
| 401 | Do not retry — auth failure (alert immediately, this means credentials broke) |
| 404 | Do not retry — invalid resource ID |
| 422 | Do not retry — validation failure |
| 429 | Wait 5 seconds to 1 minute, then retry |
| 5xx | Retry, **max 5 retries**, exponential backoff |

**Verified error codes we will map to specific customer-facing behaviour:**

| Code | Our behaviour |
|---|---|
| `SHIPMENT_PROMISE_NOT_FOUND` | Promise expired — request a fresh one and retry once, automatically |
| `DROPOFF_OUTSIDE_OF_DELIVERY_AREA` | Block at checkout: "we can't deliver to this address — pickup available" |
| `PICKUP_OUTSIDE_DELIVERY_AREA` | Configuration problem on our side — alert you, not the customer |
| `REQUEST_OUTSIDE_DELIVERY_HOURS` | Show delivery hours, offer pickup or scheduled order |
| `DELIVERY_AREA_CLOSED` / `DELIVERY_AREA_CLOSED_TEMPORARILY` | Temporarily disable delivery, keep pickup open, retry availability periodically |
| `VENUE_CLOSED` | Same as above |
| `DUPLICATE_ORDER` | Treat as success — look up the existing delivery rather than creating another |
| `GENERIC_INTERNAL_ERROR` | Retry per the 5xx policy; escalate to you if persistent |

Wolt's docs also state two UX requirements we should treat as binding: *"Senders or recipients should never need to double-check delivery status by contacting support"* and *"Do not indicate a delivery is in progress if it failed at creation."* Both are already satisfied by the design above.

### G.4 Code structure for the integration

```
src/server/delivery/
├── provider.ts            # the interface the rest of the app sees
├── types.ts               # our own domain types (NOT Wolt's shapes)
├── wolt/
│   ├── client.ts          # HTTP: auth header, timeouts, retries, logging
│   ├── mappers.ts         # Wolt payload  <->  our domain types
│   ├── errors.ts          # Wolt error codes -> our error taxonomy
│   ├── webhook.ts         # JWT verification + event normalisation
│   └── events.ts          # event type -> delivery state rank
└── index.ts               # exports a single configured provider
```

The rest of the application only ever calls `deliveryProvider.quote()`, `.create()`, `.cancel()`. It never sees a Wolt field name. That is the entire extent of the abstraction — one interface, one implementation. No plugin registry, no provider factory, no config-driven dispatch. That's the "modular but not over-engineered" line you asked for.

### G.5 What I could NOT verify — raise these with your Wolt account manager

**[v1.1]** The signed Agreement closed item 4 and partially closed item 8. Everything else remains open — the Agreement contains commercial terms only, with no technical annex, no `merchant_id`, no `venue_id` and no API credentials.

1. **[NEEDS CONFIRMATION]** There is no documented `GET` endpoint to fetch a delivery's current status. If webhooks are missed, we appear to have no way to poll for truth. **Ask Wolt directly whether a status-read endpoint exists.** This materially affects how we build reconciliation. *(Partial mitigation found in the contract: the "Tracking Interface" definition mentions access to Wolt's proprietary merchant admin portal — get that login as a manual visibility layer.)*
2. **[NEEDS CONFIRMATION]** Whether Wolt Drive's venueful flow is available in the **Cyprus market**, and whether the development/sandbox environment is available to you.
3. **[NEEDS CONFIRMATION]** Whether the merchant key is a long-lived static token or requires refresh, and its rotation procedure.
4. ~~Exact pricing.~~ **[v1.1 — RESOLVED by the Agreement.]** €3.50 base covering the first 1,000 m straight-line; €0.50 per further 1,000 m increment, each *started* increment charged in full; maximum 10,000 m. Plus a penalty schedule: No-Show €3.00, Cancellation €3.00, Extra Courier €3.00, Lateness €1.00 + €0.10/min, Cash Handling 2.5%. Monthly in arrears, 30-day terms, VAT added and recoverable. Full analysis and the resulting economics are in the companion contract document.
5. **[NEEDS CONFIRMATION]** Whether Wolt requires or supports an idempotency key header on delivery creation, beyond the `DUPLICATE_ORDER` error and `merchant_order_reference_id`.
6. **[NEEDS CONFIRMATION]** Rate limits (the docs describe 429 handling but not the actual limits). Note the Agreement §8.6 prohibits actions that "overburden or impair" the service — **we must not load-test against Wolt's API, including their development environment.** Load testing will use a mocked Wolt client.
7. **[NEEDS CONFIRMATION]** Whether `order.rejected` can fire *after* a successful creation, and what recourse exists.
8. **[NEEDS CONFIRMATION]** Whether tips or handshake (PIN) delivery are enabled for your account. **[v1.1]** *Cash on delivery is confirmed available* — the Agreement includes cash terms (2.5% handling fee, monthly payout, KYC/KYB required first). We are still not using it in V1, but it's a known phase-2 option.
9. **[v1.1 — NEW] Can `min_preparation_time_minutes` be updated after a delivery is created?** I could find no endpoint for this. This matters financially: the Venue Lateness Fee is triggered against the pickup estimate *we* supply, so the ability to extend it after acceptance is worth real money.
10. **[v1.1 — NEW] Wolt Drive Web is explicitly excluded from your Agreement scope.** That means no manual fallback interface for dispatching a courier if our integration is down. **Ask Wolt to add it** — the same Service Fee applies, so it should cost nothing, and it is a valuable operational safety net.
11. **[v1.1 — NEW] Wolt brand assets and placement guidelines**, required to satisfy §2.9 (see H.9).

---

## H. Security architecture

### H.1 Secrets

- Wolt merchant key, Wolt webhook `client_secret`, Stripe secret key and Stripe webhook signing secret live in **server-side environment variables only**. They are never imported into any file under a client component, never sent in an API response, never logged.
- The only Stripe value that reaches the browser is the **publishable** key, which is designed to be public.
- Different keys for development and production, in separate environments.
- Rotation procedure documented from day one, because "who has the production key" becomes an unanswerable question within a year otherwise.
- A pre-commit secret scanner and `.env` in `.gitignore`, because the most common way restaurant systems leak keys is a public GitHub repo.

### H.2 The single most important application rule

**All prices, discounts, delivery fees and totals are recalculated on the server from database values at the moment of payment.** The browser sends *item IDs, modifier IDs and quantities*. It does not send prices. If a client-supplied total ever disagrees with the server's, we reject the request outright.

Skipping this is how e-commerce systems get bought out at 90% off by someone with browser devtools.

### H.3 Authentication and authorization

**Staff / admin**
- Username + password hashed with **argon2id**. HTTP-only, `Secure`, `SameSite=Lax` session cookies.
- **Two roles minimum:** `STAFF` (see and progress orders) and `OWNER` (menu, pricing, promotions, settings, analytics, refunds). A kitchen tablet left unlocked must not be able to change prices or issue refunds.
- Rate limiting on login (per IP and per account) plus lockout after repeated failures.
- **2FA (TOTP) required for `OWNER`.** Not for the kitchen tablet — that would be operationally unworkable — which is precisely why the roles must be split.
- The kitchen tablet gets a long-lived session on a device you explicitly trust, with permissions scoped to order handling only.
- Every privileged action writes to `audit_log`: who, what, when, from where.

**Customers**
- Guest checkout in V1 — no password, no account, minimum friction. This is the right call for conversion.
- Accounts in a later phase via **email magic link** (and optionally phone OTP). No password to leak.
- Order status pages are reachable only via an **unguessable token** in the URL, not a sequential order ID. Otherwise anyone can enumerate `/orders/1001`, `/orders/1002` and read your customers' names, phone numbers and home addresses. This is a real and common breach.

### H.4 Webhook security

| | Stripe | Wolt |
|---|---|---|
| Verification | `Stripe-Signature` header verified with the webhook signing secret, using the raw request body | HS256 JWT signature verified with our `client_secret` |
| Replay protection | Timestamp tolerance + unique event ID in `webhook_events` | Unique event ID in `webhook_events` |
| On failure | 400, log, alert | 401, log, alert |

Both handlers must read the **raw** request body for verification — a framework that parses JSON before you verify will silently break signature checking. This is a classic bug and we'll guard against it explicitly.

### H.5 Input validation and injection

- Every route handler parses its input with a **Zod schema** before anything else. No exceptions.
- Prisma parameterises all queries — SQL injection is not a practical risk provided we never use raw string-built SQL.
- React escapes output by default — no `dangerouslySetInnerHTML` anywhere near user or customer-supplied content (order notes, delivery instructions, product descriptions).
- Uploaded menu images: validate MIME type and magic bytes, re-encode server-side, cap dimensions and size, serve from a separate domain/CDN.
- A strict **Content-Security-Policy**, with the specific exceptions Stripe.js requires.

### H.6 Abuse and fraud

- Rate limits on: address lookups (each one costs you a Wolt API call and possibly a geocoding call), coupon validation, checkout attempts, order status polling.
- **Coupon redemption must be enforced by a database constraint**, not by an application check — otherwise two simultaneous requests both pass the "has this been used?" check and your single-use code gets used twice. Unique index on `(promotion_id, order_id)` and a transactional counter.
- Card testing attacks: Stripe Radar handles most of this; we add a per-IP and per-phone cap on failed payment attempts.
- Phone number verification via SMS OTP for delivery orders is worth considering in phase 2 — prank orders to real addresses are a genuine problem for direct-ordering restaurants and marketplaces shield you from it today.

### H.7 GDPR and data protection (you are in the EU — this is legally binding, not optional)

- **EU-region hosting** for both application and database (Frankfurt).
- **Data minimisation:** collect name, phone, address, email. Nothing else. No date of birth, no marketing profile you don't need.
- **You never store card data.** Stripe does. This is a large part of why we use their hosted elements.
- **Retention policy:** define how long order records with personal data are kept (statutory accounting retention in Cyprus vs. deletion of personal fields). Old orders can be anonymised while keeping the financial record.
- **Right to erasure:** an admin function to anonymise a customer's personal data while preserving the order for accounting.
- **Privacy policy and cookie consent** on the ordering site. GloriaFood provided this; once you own the system, you own the obligation.
- **Data Processing Agreements** with Stripe, your hosting provider and your email provider. **[v1.1]** The **Wolt DPA is already in hand** — it is Appendix 1 of the signed Agreement. It confirms you are the Controller and Wolt the Processor, and it requires your privacy policy to disclose transfers to sub-processors outside the EU/EEA.
- **Marketing consent must be explicit and separately recorded** with a timestamp. This matters a great deal, because building a direct marketing list is one of your stated business goals — and an improperly consented list is a liability rather than an asset.

### H.8 Reliability and integrity

- Database constraints do the heavy lifting: `UNIQUE` on `payments.order_id`, `deliveries.order_id`, `webhook_events.provider_event_id`, `orders.order_number`.
- Optimistic locking (`version` column) on orders so two staff on two devices cannot both accept.
- Neon provides automated backups and point-in-time restore — but **an untested backup is not a backup.** We will do a restore drill before go-live and put it in the runbook.
- Structured logging with an order ID on every line, so one grep reconstructs an entire order's history.
- Sentry alerts on: payment capture failures, delivery creation failures, webhook signature failures, dead-letter jobs, and orders unacknowledged past the escalation threshold.

### H.9 [v1.1] Requirements imposed by the Wolt Drive Agreement

These are not design preferences — they are contractual obligations that the build must satisfy.

| Clause | Obligation | What we build |
|---|---|---|
| §2.9 | Display the Wolt logo and brand name on the site **and at checkout**; if multiple delivery options exist, Wolt must be listed first | Wolt branding in the checkout delivery section, using their supplied asset pack |
| §2.1 | Publish company info, contact details, prices incl. VAT, service features, delivery methods, payment methods, delivery times and **complaint handling** | Real Terms, Privacy, Delivery Info and Complaints pages — not placeholders |
| §2.6 | Provide customer support contact details "clear and easily accessible" | Populate the API's `customer_support` object (url, email, phone) on every delivery; show support details on confirmation and status pages |
| §2.2–2.3 | No age-verification products (**alcohol**), no cold-chain products | A `delivery_eligible` flag per product, enforced at cart and checkout |
| §2.15 | Each on-demand order must fit one standard-sized car | Configurable large-order threshold; warn staff at acceptance; send honest `parcels` data |
| §2.7 | Never contact the courier directly | Admin UI shows Wolt's support route only; never surfaces a courier number as callable |
| §2.13 | Courier waits 5 minutes and makes 2 call attempts before a No-Show | Tell the customer this at checkout; validate phone format; send an "on the way" notification |
| §5.1–5.4 | Service provided "as is" — no uptime, availability or timeliness guarantee | **Delivery kill-switch** in admin: one button stops offering delivery instantly while pickup keeps running |
| §3.2 | Wolt may change fees on 15 days' notice | Base fee, increment amount, increment distance and max distance are **editable settings**, never constants in code |
| §8.6 | No scraping, probing, reverse engineering or overburdening | No load testing against Wolt's API; debounce address lookups; quote only on a completed address |
| §9.1 | Commercial terms are confidential | Fee values live in database settings or environment config — **never committed to source** |
| Appendix 1 | You are Controller, Wolt is Processor; some sub-processors sit outside the EU/EEA under SCCs | Privacy policy must name Wolt Cyprus Limited as processor and disclose non-EEA transfers |

### H.10 [v1.1] Designing against the penalty fees

The Agreement's fee schedule is effectively a list of ways to lose money, each preventable in software. Treat these as functional requirements.

- **Venue Lateness Fee (€1.00 + €0.10/min)** is triggered against the `min_preparation_time_minutes` *we* send. The accept screen must default to a realistic — ideally conservative — prep time, with a higher default at peak hours. Staff must be able to extend it after accepting (subject to G.5 item 9). We record promised vs. actual ready time on every order so the defaults can be tuned from data rather than guesswork. **Round prep times up, always.**
- **Cancellation Fee (€3.00)** applies only after Wolt has confirmed the delivery. This is why the delivery is created *after* the restaurant accepts, never at checkout — a rejected order then costs nothing. The admin must warn staff, with the amount, before cancelling an accepted order.
- **No-Show Fee (€3.00 plus the food)** — perishable items are not returned, so a no-show on a €35 order is a €35 loss. Validate Cypriot phone formats, state the 5-minute rule at checkout, send tracking notifications, and flag repeat offenders.
- **Extra Courier Fee (€3.00)** — add an address confirmation step showing the geocoded address back to the customer before payment, and warn on oversized orders.

---

## I. Recommended project structure

```
hatgao-ordering/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                     # menu seed for local dev
├── src/
│   ├── app/
│   │   ├── (customer)/             # public ordering site
│   │   │   ├── page.tsx            # menu
│   │   │   ├── cart/
│   │   │   ├── checkout/
│   │   │   └── order/[token]/      # status + Wolt tracking (unguessable token)
│   │   │
│   │   ├── admin/                  # staff dashboard
│   │   │   ├── login/
│   │   │   ├── orders/             # live order board (the kitchen tablet)
│   │   │   ├── orders/[id]/
│   │   │   ├── menu/
│   │   │   ├── modifiers/
│   │   │   ├── promotions/
│   │   │   ├── delivery-pricing/
│   │   │   ├── hours/
│   │   │   ├── settings/
│   │   │   └── analytics/
│   │   │
│   │   └── api/
│   │       ├── public/
│   │       │   ├── menu/
│   │       │   ├── delivery-quote/     # -> Wolt shipment-promises
│   │       │   ├── cart/
│   │       │   ├── checkout/
│   │       │   └── orders/[token]/
│   │       ├── admin/
│   │       │   ├── orders/
│   │       │   ├── menu/
│   │       │   └── settings/
│   │       ├── webhooks/
│   │       │   ├── stripe/route.ts
│   │       │   └── wolt/route.ts
│   │       └── internal/
│   │           └── jobs/tick/route.ts  # cron-triggered, secret-token guarded
│   │
│   ├── server/                     # ── ALL BUSINESS LOGIC, NO HTTP ──
│   │   ├── db.ts
│   │   ├── menu/
│   │   ├── cart/
│   │   ├── pricing/
│   │   │   ├── order-total.ts      # server-authoritative totals
│   │   │   ├── delivery-fee.ts     # the configurable rules engine
│   │   │   └── promotions.ts
│   │   ├── orders/
│   │   │   ├── state-machine.ts    # the transition map
│   │   │   ├── create.ts
│   │   │   ├── accept.ts           # the atomic pivot
│   │   │   └── cancel.ts
│   │   ├── payments/
│   │   │   ├── state-machine.ts
│   │   │   ├── stripe/
│   │   │   └── webhook-handler.ts
│   │   ├── delivery/               # (see G.4)
│   │   ├── jobs/
│   │   │   ├── queue.ts
│   │   │   ├── worker.ts
│   │   │   └── handlers/
│   │   ├── notifications/
│   │   ├── auth/
│   │   └── audit/
│   │
│   ├── components/
│   │   ├── ui/                     # shadcn primitives
│   │   ├── menu/
│   │   ├── cart/
│   │   ├── checkout/
│   │   └── admin/
│   ├── lib/                        # pure helpers: money, time, validation
│   └── config/
│
├── tests/
│   ├── unit/                       # pricing, state machines — highest value
│   ├── integration/                # API routes against a test DB
│   └── e2e/                        # Playwright: full order journey
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── RUNBOOK.md                  # "what to do when X breaks", for you at 21:00
│   └── WOLT_INTEGRATION.md
├── .env.example
└── README.md
```

The rule that keeps this maintainable: **`src/app/` may import from `src/server/`; `src/server/` may never import from `src/app/`.** Business logic stays testable without spinning up a web server.

---

## J. Development roadmap

Each phase ends with something that works and is reviewed before the next begins. Time estimates assume you're doing this alongside running a restaurant — adjust freely.

### Phase 0 — Foundations *(before any feature work)* — ✅ Done
Repo, TypeScript, Next.js, Tailwind, Prisma, Postgres running locally, environment config, linting, Git workflow, deploy pipeline to a staging URL.
**Done when:** a "hello world" page is live on a real staging URL and `prisma migrate` works.

### Phase 1 — Data model & menu management — ✅ Done, merged to `main`
Full Prisma schema. Admin auth. Admin CRUD for categories, products, modifier groups, modifiers, images, availability toggles.
**Done when:** you can enter the entire HAT GAO menu yourself through the admin UI.
**Note:** this is where you do real work — getting the menu data right (photos, descriptions, modifiers, prices) is a bigger job than it sounds and it's on the critical path.

### Phase 2 — Customer menu & cart — ✅ Done
Mobile-first public menu, product detail with modifiers, cart, quantities, notes. **No checkout, no payment.**
**Done when:** you can build a cart on your phone and it looks good.

### Phase 3 — Pickup orders, end to end — 🔜 next up
Checkout for pickup only. Server-side totals. Stripe Payment Element with manual capture. Stripe webhooks. Order confirmation. Kitchen order board with audible alert, accept/reject, status progression. Opening hours.
**Done when: you can take a real pickup order from a real customer and get paid.**
This is the milestone I'd push hard for. Pickup has no Wolt dependency, so it can go live *before* Wolt technical access arrives, and it de-risks the entire payment and kitchen-operations half of the project with real usage.

### Phase 4 — Wolt Drive integration
Wolt client, shipment promises at checkout, delivery creation on acceptance, webhook receiver with JWT verification, delivery state machine, tracking URL, error mapping, retries. Tested against Wolt's development environment. **[v1.1]** Also in this phase, from the Agreement: Wolt checkout branding (§2.9), the **delivery kill-switch**, prep-time defaults and extension, the address confirmation step, per-product `delivery_eligible` enforcement, and Wolt fee constants as editable settings.
**Done when:** a test delivery completes end-to-end in Wolt's dev environment with all state transitions correct.

### Phase 5 — Delivery pricing engine
Configurable rules in admin, subsidy tracking on every order, minimum order values, distance guards, live preview of profit impact.
**Done when:** you can change your delivery pricing strategy without calling me.

### Phase 6 — Hardening & go-live
Job queue in production, escalation alerts, Sentry, structured logging, backup restore drill, load sanity check, runbook, staff training, GDPR pages, and a **parallel run alongside GloriaFood** before you switch the website button over.
**Done when:** real customers are ordering and you've done a full weekend without incident.

### Phase 7 — Promotions & coupons
Percentage/fixed discounts, free delivery codes, first-order codes, usage limits, expiry, direct-only offers.

### Phase 8 — Customer accounts & order history
Magic-link login, saved addresses, reorder, order history.

### Phase 9 — Analytics
Direct vs. marketplace revenue, average order value, delivery subsidy cost, repeat-customer rate, peak hours, top items, promotion performance.

### Phase 10 — Growth
Loyalty/rewards, scheduled orders, push notifications, review requests, marketing list with proper consent, and — only if the tablet proves insufficient — thermal printing or POS integration.

**Phases 0–6 are V1.** Everything from 7 onward is improvement on a working revenue channel.

**Timing note on GloriaFood:** it shuts down in 2027. Starting now gives you a comfortable runway, and I'd aim to have Phase 6 complete well before then so you have months of parallel running rather than a hard cutover under pressure.

---

## K. Missing information — what I need from you

> **[v1.1]** The signed Agreement closed items 6, 8 and part of 7 below, and supplied the Data Processing Agreement. It also added new questions. The authoritative, consolidated list is now **§8.2 and §11 of the companion contract document** — work from that. What follows is the original list with resolutions marked.

### K.1 Blocking — Wolt (needed before Phase 4)

1. `merchant_id` and `venue_id` for the HAT GAO venue
2. Merchant Key / API token, for **both** development and production
3. Confirmation that the **development environment** (`daas-public-api.development.dev.woltapi.com`) is enabled for your account
4. The webhook registration procedure — do you register via `POST /v1/merchants/{merchant_id}/webhooks` yourself, or does Wolt configure it?
5. Confirmation that the **venueful** flow (shipment-promises + deliveries) is what your Cyprus contract provides
6. ~~**Your actual pricing schedule** from the contract~~ — **[v1.1 RESOLVED]** €3.50 base / first 1 km, €0.50 per further started 1 km, 10 km max, plus the penalty schedule. No minimum volume commitment exists. Monthly in arrears, 30-day terms.
7. Wolt Drive **operating hours and delivery area** for Nicosia — *still open; the contract says only "Wolt's existing delivery areas" and that Wolt may adjust them unilaterally*
8. ~~Your Wolt technical contact's name and email~~ — **[v1.1 RESOLVED]** Eleni Aristodemou (commercial); Andreas Papagiannis, andreas.papagiannis@wolt.com (signatory). You are named as Partner technical contact at tan.hatgao@gmail.com.
9. Answers to the eight open questions in Section G.5 — especially **whether a delivery status polling endpoint exists**

### K.2 Blocking — business (needed for Phase 1)

10. **The complete current menu**: categories, item names, descriptions, prices, photos. Can you export from GloriaFood? If not, we need a spreadsheet.
11. **Modifier structure** per item: spice levels, protein choices, extras, sizes — with min/max selection rules and price deltas
12. **Opening hours**, and whether delivery hours differ from pickup hours
13. **Typical preparation times**, and whether they differ at peak
14. **VAT treatment** in Cyprus for dine-in vs. takeaway vs. delivery, and whether delivery fees are taxed. **[v1.1]** Cyprus applies 19% standard, 9% to restaurant and catering services and 5% to food and beverages; the takeaway/delivery classification is exactly the kind of distinction that needs a professional answer. Wolt's own Service Fee attracts 19%, recoverable as input VAT. Please put this to your accountant — getting VAT wrong on every order is expensive to unwind.
15. **Minimum order values** for delivery and for pickup
16. **Languages** — English only, or English + Greek (+ Vietnamese)? This affects the data model, so it's cheaper to decide now than to retrofit.
17. **Allergen/nutritional information** — any legal requirement to display it in Cyprus?

### K.3 Blocking — technical access

18. **Domain and DNS access** for `hatgaocy.com` (to create the `order.` subdomain)
19. **WordPress admin access** (to add the Order Online button)
20. Legal entity details for the **Stripe account**: company name, registration number, VAT number, bank account, director ID for KYC
21. Whether you already have a **Google Cloud / Mapbox account** for geocoding, or want me to recommend one
22. Your **GitHub** account (for the repo)

### K.4 Decisions I need from you

23. **Order acknowledgement timeout** — how many minutes before we escalate, and what happens on hard timeout?
24. **Initial delivery pricing strategy** — your opening position, which we can tune later
25. **Should customers be able to order when the restaurant is closed** (scheduled for later), or is the site simply closed?
26. **Customer notifications** — email only in V1, or SMS too? SMS costs money per message and needs a provider; email is free-ish but less reliable for "your food is on the way."
27. **Refund policy** — who can issue refunds, and up to what value without your approval?
28. **Do you want direct-only pricing?** Cheaper on your site than on Wolt marketplace is the single most effective lever for moving customers across — see the warning in L.1.

### K.5 Useful but not blocking

29. Current monthly order volume and average order value on Wolt and Foody
30. Your current commission rates (so we can measure what this saves)
31. Peak hours and peak day volume
32. Brand assets: logo files, brand colours, fonts, food photography

---

## L. Risks

Ordered by how much I think each one could actually hurt you.

### L.1 Your Wolt marketplace contract may contain a price parity clause — STILL UNRESOLVED

**[v1.1 update]** The **Drive** agreement is clear: §2.4 states *"Partner independently determines the price for the Service that the Partner resells to and charges from the User."* You are free to price delivery however you like, and there is no parity clause in the Drive contract. It also states (§1.1) that it does not alter any other agreement between you and Wolt — so your **marketplace** terms are untouched and still unexamined.

**Risk:** Many marketplace agreements restrict a restaurant from offering lower prices or better terms on its own channels. If yours does, your most powerful growth lever — cheaper direct prices — could breach your contract with the same company that is now also your delivery provider.

**Why it's serious:** You depend on Wolt marketplace revenue and now on Wolt Drive. A dispute here affects two revenue channels at once.

**Prevention:** Retrieve the marketplace agreement — check the `hatgao.restaurant@gmail.com` inbox for the original onboarding email, look in the Wolt Merchant Portal, or ask Eleni Aristodemou. Look specifically for price parity, rate parity, "most favoured nation" wording, exclusivity, or minimum volume commitments. Do this **before** we design the promotions system in Phase 7.

**In the meantime**, the promotions design should lead with levers that parity clauses almost never cover: loyalty rewards, free-delivery thresholds (a delivery term, not a food price), direct-only bundles that don't exist on the marketplace, pickup discounts, and free extras with direct orders.

### L.2 Kitchen operations, not software, is the most likely cause of failure

**Risk:** An order arrives, the tablet is muted or asleep or someone dismissed the alert, and a paying customer waits 40 minutes for food nobody started. This kills direct ordering faster than any bug, because Wolt marketplace has spent years drilling this habit into your staff and your own system hasn't.

**Prevention:** Continuous, non-dismissable audio alert. Screen-wake lock on the tablet. Escalation to your personal phone after N minutes. A daily "unacknowledged orders" report. Staff training as an explicit line item in Phase 6, not an afterthought. And a **parallel run** where direct orders are low-volume before you promote the channel hard.

### L.3 Delivery cost destroying your margin

**[v1.1 update — this risk is smaller than I thought.]** With confirmed pricing (€3.50 + €0.50/km, so €3.50–€5.50 across most of Nicosia) and an assumed 30% marketplace commission, a €25 direct order leaves you roughly **€2.37 ahead even giving delivery away entirely**, and the advantage grows with basket size. The real exposure is **small orders**, not distant ones: a €15 order at 3 km loses money with free delivery. Full working in the companion contract document. I still need your actual commission rate to finalise this.

**Risk:** Wolt Drive costs you more per delivery than the marketplace fee customers are used to seeing. Absorb too much on small baskets and you lose money on those orders — and penalty fees (lateness, no-show) can quietly erode the margin on the rest.

**Prevention:** Every order stores `wolt_cost`, `customer_delivery_fee` and `subsidy`. The analytics phase must answer, in euros, whether a direct order nets you more than a marketplace order. Distance guards to refuse structurally unprofitable deliveries. Free-delivery thresholds set above your average order value, so the subsidy is bought with a *bigger* order rather than given away.

### L.4 Customers simply don't switch

**Risk:** You build everything and people keep opening the Wolt app out of habit. Marketplaces own discovery; you own only your existing customers.

**Prevention:** Treat this as a marketing project with a software component, not the reverse. Flyers and QR codes in every delivery bag. A direct-only incentive on the first order (contract permitting — see L.1). Staff mentioning it. Website and Google Business Profile pointing at direct ordering. Realistically, expect to move loyal repeat customers first; new-customer discovery will stay with the marketplaces, and that's fine — that's the deal.

### L.5 Payment/delivery desynchronisation

**Risk:** The classic failure you flagged: money taken, no delivery.

**Prevention:** The manual-capture design in Section A.4 largely eliminates it. Capture only happens after the delivery exists. Everything in between is a hold that can be released for free.

### L.6 The Wolt technical unknowns

**Risk:** Section G.5 lists eight things I couldn't verify from public documentation. If, for example, there's genuinely no way to poll delivery status, our recovery from missed webhooks is weaker than I'd like.

**Prevention:** Get answers before Phase 4 starts. Build against the development environment first. Design the delivery module so its assumptions are in one place and correcting them is a small change.

### L.7 Single-developer dependency (this one is about you)

**Risk:** You are the only person who understands this system, and you also run a restaurant. If you're ill, travelling, or simply busy during service, nobody can fix a production problem.

**Prevention:** This is why I'm insisting on the runbook, on error monitoring that pushes alerts rather than waiting to be checked, on managed hosting so there's no server to maintain, and on boring technology that a contractor could pick up. Also: **keep GloriaFood running in parallel until you're confident**, and be honest with yourself about whether you want a support contract with a developer for the first six months.

### L.8 Menu data migration is bigger than it looks

**Risk:** Modifiers, combinations, photos, translations. It's tedious and it's on the critical path for Phase 2 onward.

**Prevention:** Start extracting the menu **now**, in parallel with Phase 0/1 development. If GloriaFood offers an export, get it before the platform winds down.

### L.9 Scope creep

**Risk:** Loyalty programmes, table booking, gift cards, a mobile app. Each is reasonable in isolation; together they mean you never launch.

**Prevention:** Phases 0–6 only for V1. Everything else goes on a written list and waits. I'll push back when new ideas arrive mid-phase — that's part of what you're asking me to do.

### L.10 Fraud and prank orders

**Risk:** Marketplaces absorb a lot of this today. Direct, you're exposed to card testing and to prank orders sent to real addresses.

**Prevention:** Stripe Radar from day one. Rate limits. Phone OTP for delivery orders if it becomes a problem. Manual capture also helps — a fraudulent order can be rejected before any money moves.

### L.11 Peak-hour load

**Risk:** Friday 20:00. Not a scale problem at your volume — a *correctness* problem. Concurrent accepts, race conditions on coupons, double submissions.

**Prevention:** Database constraints and optimistic locking rather than application-level checks. This is designed in from Phase 1, not bolted on.

---

## Summary

The architecture rests on four decisions:

1. **One Next.js + Postgres application**, deliberately boring, on managed EU hosting.
2. **Authorize the card at checkout, capture only after the restaurant accepts and the Wolt delivery exists.** This turns your hardest failure scenario into a non-event.
3. **Three independent state machines** — order, payment, delivery — that never contaminate each other, each advanced only by verified events.
4. **Wolt Drive behind a single interface**, using the venueful flow, with webhook JWT verification, an event inbox for idempotency, and rank-based ordering because Wolt's own documentation warns events arrive out of order.

The commercial risk is larger than the technical risk. The two things to do this week have nothing to do with code: **read your Wolt marketplace contract for a parity clause**, and **get the technical answers in Section G.5 from your Wolt contact**.

---

### Next step

Review this and tell me what to change. My recommendation for what comes after approval is **Phase 0 and Phase 1** — repo setup and the complete database schema — since the schema is the thing everything else depends on and the thing that's most expensive to get wrong.

We can begin Phase 3 (pickup orders end-to-end, real payments) without waiting for anything from Wolt. That's a fully working, revenue-generating slice of the system, and I'd like to reach it early.

---

## Sources

- [Wolt Drive overview — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive)
- [Wolt Drive API endpoints — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive/endpoints)
- [Wolt Drive API webhook service — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive/webhooks)
- [Wolt Drive API error handling — Wolt for Developers](https://developer.wolt.com/docs/wolt-drive/error-handling)
- [API reference for Wolt Drive API — Wolt for Developers](https://developer.wolt.com/docs/api/wolt-drive)
- [Stripe global availability](https://stripe.com/global)
