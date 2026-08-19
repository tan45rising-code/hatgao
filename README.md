# Hat Gao — Direct Ordering System

Customer ordering site, restaurant admin dashboard, and API for Hat Gao
Vietnamese Restaurant (Nicosia, Cyprus), built to replace GloriaFood ahead
of its March 2027 shutdown. Wolt Drive provides last-mile delivery; Stripe
handles payment.

Full design context lives in `docs/`:

- `docs/ARCHITECTURE.md` — the approved architecture (tech stack, system
  design, database, order/payment/delivery state machines, Wolt
  integration, security, roadmap, risks)
- `docs/WOLT_CONTRACT_ANALYSIS.md` — analysis of the signed Wolt Drive API
  Service Agreement (fees, contractual build requirements, economics)

Read those before making structural changes — they explain *why*, not
just *what*.

## Status

**Phase 0 — Foundations.** This is a scaffold: the toolchain works
end to end, but there's no menu, no ordering flow, and no Wolt or Stripe
integration yet. See the roadmap in `docs/ARCHITECTURE.md` Section J.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- A local PostgreSQL 16 server
- npm

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Provision the local database (idempotent, safe to re-run)
./scripts/dev-db-setup.sh

# 3. Copy the env template and fill in what you have
cp .env.example .env.local

# 4. Push the (currently placeholder) schema and generate the client
npm run prisma:migrate

# 5. Run the dev server
npm run dev
```

Visit http://localhost:3000.

## Project structure

```
src/
├── app/        # Next.js App Router — pages, API routes. Thin.
├── server/     # ALL business logic. No HTTP. See src/server/README.md.
├── components/ # UI components
├── lib/        # Pure helpers (money, time, validation)
└── config/     # App configuration
prisma/         # Database schema and migrations
tests/          # unit / integration / e2e
docs/           # Architecture and contract analysis — read first
scripts/        # Dev tooling (db setup, etc.)
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run prisma:migrate` | Apply schema changes to the local DB |
| `npm run prisma:studio` | Browse the local database |
| `npm run db:seed` | Seed local dev data |

## A note on secrets

Nothing under `.env*` (except `.env.example`) is committed — see
`.gitignore`. Wolt and Stripe credentials are server-side only and must
never be imported into a client component. See `docs/ARCHITECTURE.md`
Section H.1.
