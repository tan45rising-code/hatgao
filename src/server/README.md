# `src/server/`

All business logic lives here: menu, cart, pricing, orders, payments,
delivery, jobs, notifications, auth, audit.

**The one rule that keeps this maintainable:** code in `src/server/` may
never import from `src/app/`. `src/app/` (pages and API routes) may import
from `src/server/`, not the other way round. Business logic stays plain
TypeScript with no HTTP or Next.js concerns baked in, which means it's
testable in isolation and portable if it ever needs to move.

This directory is empty until Phase 1, when the real schema and the first
modules (menu, orders) land. See `docs/ARCHITECTURE.md` Section I for the
full intended layout.
