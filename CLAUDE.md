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

**Phase 1 in progress.** Done so far:
- Full Prisma schema (`prisma/schema.prisma`) — menu, orders, payments,
  deliveries, jobs, webhook inbox, promotions, audit log
- Real Hat Gao menu seeded: 74 products across 12 categories
- Domain logic in `src/server` and `src/lib`, with 60 passing tests
  (`npm run test:domain`)

**Not done yet:** the admin dashboard (staff auth, menu CRUD, availability
toggles). That is the next task.

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
npm run test:domain      # 60 domain tests (no packages needed beyond tsx)
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
