# `prisma/verify/`

SQL used to prove the schema design works, because the development sandbox
currently cannot reach the npm registry and `prisma migrate` therefore
can't run here.

| File | What it does |
|---|---|
| `001_schema.sql` | Hand-derived DDL equivalent to `schema.prisma` |
| `002_seed_menu.sql` | The real Hat Gao menu — 74 products, 12 categories, 8 modifier groups |
| `003_tests.sql` | Correctness tests, mostly NEGATIVE ones |

Run against a local Postgres:

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/verify/001_schema.sql
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/verify/002_seed_menu.sql
psql "$DIRECT_URL" -f prisma/verify/003_tests.sql
```

`003_tests.sql` is the interesting one. Most of its cases deliberately
attempt something that must fail — creating two payments for one order,
redeeming a coupon twice, marking beer as deliverable — and report PASS
only if the database refused. That is what makes the guarantees in
`docs/ARCHITECTURE.md` real rather than aspirational.

**`schema.prisma` remains the source of truth.** Once npm access returns,
`prisma migrate dev` generates the real migration from it and this folder
can be deleted. The seed should then move to `prisma/seed.ts`.

## Domain logic tests

Separately from the SQL above, the pure business logic is tested with a
runnable script that needs no packages beyond globally-available `tsx`:

```bash
npm run test:domain        # tsx tests/unit/domain.test.ts
npm run typecheck:domain   # strict tsc over src/lib and src/server
```

60 tests cover money/VAT arithmetic, the Wolt fee model, the delivery
pricing rules, server-side order pricing, the order state machine, the
Wolt webhook ordering guard, and opening hours. These convert to Vitest
with a find-and-replace once npm access returns.
