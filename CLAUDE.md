# Hat Gao ordering system — context for Claude

Read this first. It exists so a new session can pick up without the owner
having to re-explain the project.

## Who you're working with

Tan runs Hat Gao, a Vietnamese restaurant in Nicosia, Cyprus. He studied
Computer Science and can follow technical reasoning, but he is not a
working developer and does not want to be. Explain decisions in practical
terms, say why not just what, and correct him when he's wrong — he has
asked for that explicitly.

He is replacing GloriaFood (shutting down 2027) with a direct ordering
system, to escape marketplace commission and own the customer
relationship. Wolt Drive handles last-mile delivery only.

**This is a real production system that will take real payments.** Not a
demo. Build accordingly.

## Read these before making architectural decisions

- `docs/ARCHITECTURE.md` — the approved design: stack, database, three
  separate state machines (order / payment / delivery), Wolt integration,
  security, phased roadmap, risks. Sections are lettered A–L.
- `docs/WOLT_CONTRACT_ANALYSIS.md` — analysis of the SIGNED Wolt Drive
  agreement: real fee schedule, the penalty fees, contractual build
  requirements, and the economics of direct vs marketplace.

Do not re-litigate settled decisions without reason. Do flag it if you
think one is wrong.

## Current state

**Phase 0 complete.** Repo → GitHub → Vercel auto-deploy → live URL, with
a Neon Postgres database. Verified working.

**Phase 1 complete, merged to `main`** (`ea3d6f4`). The `admin-dashboard`
branch it was built on is now stale — main has since-fixed bugs that
branch doesn't, don't build on it, safe to delete.
- Full Prisma schema (`prisma/schema.prisma`) — menu, orders, payments,
  deliveries, jobs, webhook inbox, promotions, audit log
- Real Hat Gao menu seeded: 74 products across 12 categories
- Domain logic in `src/server` and `src/lib`, with 86 passing tests
  (`npm run test:domain`)
- **Admin dashboard**:
  - **Staff auth core** — password login (`argon2id`), roles (`OWNER`/
    `STAFF` with a hierarchy check), 5-attempts/15-minute lockout, full
    audit trail. `npm run staff:create` creates accounts from the CLI —
    there's no in-UI account creation yet.
  - **2FA** — mandatory TOTP for `OWNER` accounts, enforced by
    `src/middleware.ts` redirecting an unenrolled OWNER to
    `/admin/2fa/setup` before anything else. 10 one-time recovery codes
    (argon2id-hashed, never stored plaintext) shown once at enrollment.
    **Confirm with Tan whether his OWNER account is actually enrolled**
    before relying on this in production — it was deliberately left
    unenrolled through Phase 1 development and hasn't been touched since,
    so don't assume either way.
  - **Menu CRUD** — categories, products, modifier groups, all OWNER-only
    (`ROUTE_ROLE_REQUIREMENTS` in `src/middleware.ts`). Product
    availability is a 3-state dropdown (Available / Sold out today /
    Unavailable) — "sold out today" self-heals at next local midnight via
    a lazy sync (`src/server/menu/sync-availability.ts`), no cron needed.
    The product list orders by menu number when "all categories" is
    selected, by manual sort order within a single filtered category.
    Photo upload goes browser → Vercel Blob directly (a client-side
    upload, not a plain Server Action file post) with the server
    re-fetching and re-encoding via `sharp` as the real validation —
    see gotcha 6, this isn't the obvious way to do it and there's a real
    reason.

**Phase 2 complete — customer menu & cart**
(`src/app/(customer)`, `src/components/customer`). Mobile-first public
menu, product detail popup with modifiers/quantity/notes, cart with
quantity/remove, a "Most Ordered" horizontal-scroll section, "Often
bought with" / "Recommended for you" cross-sell. **No checkout, no
payment yet** — that's Phase 3. Went through several rounds of real
mobile-touch hardening beyond the initial build:
  - Swipe-to-close (product popup, cart) and swipe-to-delete (cart line)
    both require real distance (a fraction of screen size, not a fixed
    px count) OR a genuinely fast flick — see gotcha 8. Swipe-to-delete
    also gives feedback right at its threshold (trash icon grows, haptic
    pulse where supported) instead of surprising the user on release.
  - Cart drawer locks page scroll while open, matching the other two
    overlays — fixes a pull-to-refresh false-trigger and a footer/
    scroll-interaction bug that only showed up without it.
  - Notes textarea is `text-base`, not `text-sm` — see gotcha 7.

**Phase 3 built, not yet live** — pickup checkout, Stripe payment
(manual capture), Stripe webhooks, order confirmation, kitchen order
board, opening-hours admin. Confirmed OWNER 2FA enrollment (already
done, per Tan). All new code is typechecked/linted/built clean, and
verified as far as possible without real Stripe credentials: the full
order-creation → availability-gate → DB-transaction → compensating-
failure path was exercised end to end against the real Neon database
(a checkout attempt with no `STRIPE_SECRET_KEY` correctly creates the
order, fails at PaymentIntent creation, and marks `Order`/`Payment`
`FAILED` rather than leaving anything half-done); the kitchen board's
accept/reject/status-progression flow and the STAFF/OWNER nav+middleware
split were verified the same way, including the money-safety guarantee
that a failed Stripe capture leaves the order at `PLACED`, never
silently `ACCEPTED`. What's **not yet verified** because it needs real
credentials: an actual card payment completing through Stripe Elements,
and a real Stripe webhook delivery (signature verification, the
`amount_capturable_updated` → `PLACED` transition, capture, void).

Still outstanding before this can take a real customer's payment:
- **Tan**: create a Stripe account, get **test-mode** keys
  (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), install
  the Stripe CLI, run `stripe listen --forward-to
  localhost:3000/api/webhooks/stripe` for local webhook testing (see
  `STRIPE_WEBHOOK_SECRET` in `.env.example`), then walk a full test order
  end to end (test card `4242 4242 4242 4242`).
- **Tan**: set real opening hours via the new `/admin/hours` page (OWNER
  only) and review `/admin/settings` (pickup minimum, prep times) — both
  currently hold placeholder/test values from development, not real
  numbers.
- Order confirmation is on-screen only (no email — `RESEND_API_KEY`
  isn't configured; deferred by agreement with Tan, not an oversight).
- Delivery/Wolt remains entirely out of scope — Phase 4.

## Hard-won gotchas — do not rediscover these

1. **Prisma cannot express CHECK constraints.** `prisma db push` silently
   creates the tables WITHOUT the 15 integrity rules the schema was
   verified against. Run `prisma/verify/004_constraints.sql` after every
   push or migrate. One of those constraints enforces a signed contract
   term; another prevents refunding money that was never captured.

2. **Local env vars go in `.env`, not `.env.local`.** Next.js reads both,
   the Prisma CLI only reads `.env`. Using `.env.local` gives a working
   website and a `prisma` command that can't find the database.

3. **Pin Prisma to v6.** v7 removes `url`/`directUrl` from the datasource
   block and requires `prisma.config.ts`. Not worth the migration now.

4. **Neon needs two connection strings.** Pooled (hostname contains
   `-pooler`) → `DATABASE_URL`, used by the app. Direct → `DIRECT_URL`,
   used by the Prisma CLI.

5. **Seed SQL must stay idempotent and must not contain BEGIN/COMMIT.**
   psql and Neon's editor supply their own transaction; nesting turns one
   bad statement into a "transaction is aborted" cascade.

6. **Vercel Serverless Functions cap request bodies at ~4.5MB — Next's
   own `serverActions.bodySizeLimit` config cannot raise it.** That cap
   is enforced by Vercel's routing layer before a Server Action's code
   (or Next's config) ever runs, so it's easy to "fix" this in a way that
   works locally and on small test files and still breaks in production
   on a real few-MB photo. This bit the product-photo upload twice before
   the real fix landed: the browser now uploads the raw file directly to
   Vercel Blob (client-side, via a short-lived token from a small route
   handler that never sees the bytes), and the Server Action only ever
   receives the resulting URL — it re-fetches the bytes server-side to
   validate/re-encode with `sharp`. See `src/server/menu/product-image.ts`
   and `src/app/admin/(protected)/menu/products/photo-upload/route.ts`.
   Any future large-upload feature needs the same pattern, not a plain
   `<input type="file">` inside a form bound to a Server Action.

7. **Mobile browsers zoom the whole page in on focus for any text input
   under 16px font-size, and zooming back out on blur is the unreliable
   half** — especially inside a `fixed`-position sheet like the product
   popup. Don't try to force a zoom-out; just never trigger the zoom-in.
   Any real text `<input>` or `<textarea>` needs `text-base` (16px)
   minimum, never `text-sm`.

8. **Touch-gesture thresholds (swipe-to-close, swipe-to-delete) need to
   be distance-OR-velocity, with distance expressed as a fraction of
   `window.innerWidth`/`innerHeight`, not a fixed px count.** A fixed-px
   threshold feels completely different on a small phone vs a tablet, and
   distance-only (however large) is either too easy for a deliberate fast
   flick to feel sluggish, or too small for a slow careful drag to feel
   safe from accidental triggers — it needs both, checked independently.
   See `src/lib/use-drag-to-close.ts` and
   `src/components/customer/swipeable-cart-line.tsx` — both recompute
   their threshold fresh per gesture (touchstart), never once at load.

9. **This environment's Browser-pane `computer` tool can't reliably
   simulate real touch drags** — mobile-preset clicks/drags there time
   out inconsistently. That's a tool-level quirk, not an app bug:
   screenshots and desktop-mode mouse clicks work fine throughout, and
   there were never any console/server errors alongside the timeouts. To
   actually verify touch-gesture code, dispatch real `Touch`/`TouchEvent`
   objects at the target element via `javascript_tool` instead — that
   exercises the real listeners and real state, not a mock, and is how
   the swipe-to-delete threshold/feedback logic actually got verified.

10. **Never construct a third-party SDK client (Stripe, etc.) at module
    scope with a possibly-missing API key.** `next build`'s "Collecting
    page data" step imports every route module — including
    `src/app/api/webhooks/stripe/route.ts` — to statically analyze it,
    which runs that module's top-level code even though nothing is
    actually handling a request. The Stripe SDK's constructor throws
    immediately on an empty/missing key, so a plain `export const stripe
    = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")` crashes the build
    outright in any environment that hasn't configured Stripe yet
    (including local dev before Tan adds test keys). Fix: construct
    lazily — see `src/server/payments/stripe/client.ts`, which wraps a
    memoized constructor in a `Proxy` so the real `new Stripe(...)` only
    happens on first property access, which only ever occurs inside an
    actual request handler.

## Non-negotiable business rules

These come from the signed Wolt Drive agreement. Breaking them is a
contract breach or a direct financial loss.

- **Beer is never deliverable.** Agreement §2.2–2.3 forbids delivering
  products requiring age verification. Enforced in three places: a DB
  CHECK constraint, the pricing logic, and the menu query. Pickup is fine.
- **Create the Wolt delivery only AFTER the restaurant accepts.** A
  cancellation after Wolt confirms costs €3.00. An order rejected before
  creation costs nothing.
- **Authorize the card at checkout; capture only after acceptance AND
  successful delivery creation.** This turns "paid but no delivery" from a
  financial incident into a released hold.
- **Quote prep times generously.** The Venue Lateness Fee (€1.00 at 10
  min late, then €0.10/min) is measured against the prep estimate *we*
  send Wolt. Round up.
- **Never trust client-supplied prices.** The browser sends product ids,
  modifier ids and quantities. Everything else is recomputed server-side
  from the database. See `src/server/pricing/order-total.ts`.
- **Allergen data does not publish until a human verifies it.**
  `products.allergensVerified` defaults to false and gates display.

## Conventions

- **Money is always integer cents.** €8.50 is `850`. Never floats.
- **VAT in basis points.** 5% food = `500`, 9% soft drinks = `900`,
  19% alcohol = `1900`. Menu prices are VAT-INCLUSIVE, so tax is
  extracted, not added.
- **Order lines snapshot name, price and VAT rate** at time of order.
  Changing a menu price must never alter a past order.
- **`src/app` may import from `src/server`. Never the reverse.** Business
  logic stays free of HTTP so it can be tested standalone.
- **Soft-delete anything orderable.** Order history references it forever.
- **Prefer database constraints over application checks** for anything
  involving money, duplicates, or contract compliance.

## Commands

```bash
npm run dev              # dev server
npm run test:domain      # 86 domain tests (no packages needed beyond tsx)
npm run typecheck:domain # strict tsc over src/lib + src/server
npx prisma db push       # sync schema to the database
npm run db:constraints   # ALWAYS run after db push — see gotcha 1
npm run db:seed          # load the menu (needs psql)
```

## Open questions for Tan

Ask; don't assume.

- Marketplace commission rate — needed to finalise the delivery pricing
  economics. Still assumed at 30%.
- The Wolt **marketplace** contract (separate from the Drive contract we
  have) — needs checking for a price parity clause before promotions are
  designed.
- VAT treatment of delivered vs dine-in food — his accountant needs to
  confirm. Currently 5% food / 9% soft drinks / 19% beer.
- Allergen data per dish — he will verify a drafted checklist.
- Whether any modifier choice carries a surcharge (currently all €0).
- Still outstanding from Wolt: `merchant_id`, `venue_id`, API credentials,
  whether a delivery-status polling endpoint exists, and whether Wolt
  Drive Web can be added as a manual fallback. See
  `docs/WOLT_CONTRACT_ANALYSIS.md` §8.2 for the full list.

## Working style he has asked for

Explain what you're building and why before building it. Say which files
you'll touch. Implement, test, review, then move on. Don't rewrite working
code unnecessarily. One phase at a time.

Where possible, verify rather than assume — run the thing, read the real
error. A previous stint of this project was done in an environment that
couldn't execute the code, and every serious problem traced back to that.
