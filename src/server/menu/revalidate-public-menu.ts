/**
 * Call this from every admin action that changes anything the public menu
 * (`src/app/(customer)/page.tsx`, via `getPublicMenu`) reads — products,
 * categories, modifier groups, modifiers, availability.
 *
 * `getPublicMenu()` queries Prisma directly, not `fetch()`, so Next's Data
 * Cache never sees it — but the customer page itself still gets Full Route
 * Cache treatment (it doesn't touch cookies/headers/searchParams, so
 * there's nothing to make Next treat it as dynamic). Without an explicit
 * `revalidatePath("/")` after a write, the rendered page — including a
 * product's photo — keeps serving whatever it last rendered, indefinitely.
 * That's the bug this fixes: admin dashboard reflects a change instantly
 * (that page is auth-gated, so it's dynamic already); the public menu
 * silently doesn't, because nothing ever told the cache to drop it.
 */

import { revalidatePath } from "next/cache";

export function revalidatePublicMenu(): void {
  revalidatePath("/");
}
