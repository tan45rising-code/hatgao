/**
 * The single accessor for the `Settings` singleton row.
 *
 * Before this, every call site fetched it inline with a hardcoded
 * `id: "singleton"` (see `src/app/admin/(protected)/menu/products/actions.ts`).
 * That's fine for one call site; Phase 3 adds several more (checkout,
 * accept, the kitchen board's prep-time math, the opening-hours admin
 * page), so it's worth having one place that also guarantees the row
 * exists rather than every caller separately deciding what a missing
 * row means.
 *
 * `upsert` with an empty `update: {}` rather than `findUnique` +
 * hand-copied defaults — the schema's `@default(...)` values are the
 * single source of truth for what a fresh install looks like; copying
 * them a second time here would just be a second place to keep in sync.
 */

import type { Settings } from "@prisma/client";
import { prisma } from "@/server/db";

export async function getSettings(): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
