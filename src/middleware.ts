/**
 * Route protection for `/admin/**`.
 *
 * Everything under `/admin` requires a signed-in staff session except the
 * login page itself. `ROUTE_ROLE_REQUIREMENTS` gates specific sections to
 * OWNER — menu management (H.3: "OWNER: menu, pricing, promotions,
 * settings, analytics, refunds") is OWNER-only; the kitchen order board
 * (a later phase) will be reachable by STAFF.
 *
 * Also enforces 2FA for OWNER (H.3): an OWNER account without
 * `twoFactorEnabled` gets redirected to `/admin/2fa/setup` before it can
 * reach anything else under `/admin`. Login itself still succeeds on
 * password alone for such an account — there's no other way for them to
 * reach the enrollment page in the first place.
 *
 * Lives at `src/middleware.ts`, not the repo root — Next.js requires that
 * when the project has a `src/` directory (which this one does, since
 * `src/app` exists). Placed at the true repo root instead, Next.js
 * silently never registers it: no build error, no runtime error, every
 * request just passes straight through. Cost real time to track down.
 */

import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import type { StaffRole } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { canAccess, needsTwoFactorSetup } from "@/server/auth/session";

// Deliberately NOT `import { auth } from "@/auth"` — that file pulls in
// Prisma Client and argon2 (both Node-only), which the Edge runtime
// middleware.ts runs in cannot load. This builds a second, edge-safe
// NextAuth() instance from just the shared config to decode the session
// cookie. See src/auth.config.ts for the full explanation.
const { auth } = NextAuth(authConfig);

const PUBLIC_ADMIN_PATHS = ["/admin/login"];
const TWO_FACTOR_SETUP_PATH = "/admin/2fa/setup";

/** Longest matching prefix wins, so a more specific route can override a broader one. */
const ROUTE_ROLE_REQUIREMENTS: Record<string, StaffRole> = {
  "/admin/menu": "OWNER",
  // STAFF can view the products list and change availability status
  // (Available / Sold out today / Unavailable) — nothing else on the
  // menu. The trailing-slash entry below is deliberately MORE specific
  // (one character longer) so it wins for everything actually nested
  // under /admin/menu/products/ — "new", an [id] edit page, photo-upload
  // — while the bare list page itself (no trailing slash) matches only
  // the STAFF entry. Editing and deleting stay OWNER-only either way:
  // this only controls which PAGE loads, not which Server Action a
  // request is allowed to invoke — see requireOwnerRole() in
  // menu/products/actions.ts for the actual enforcement, since a Server
  // Action posts to the list page's own URL and isn't distinguished here.
  "/admin/menu/products": "STAFF",
  "/admin/menu/products/": "OWNER",
  // Opening hours and service settings control whether the site takes
  // money at all — OWNER territory (H.3), not a kitchen tablet login.
  // "/admin/orders" (the kitchen board) intentionally has no entry here
  // and falls through to the default STAFF requirement below.
  "/admin/hours": "OWNER",
  "/admin/settings": "OWNER",
};

function requiredRoleFor(pathname: string): StaffRole {
  let best: { prefix: string; role: StaffRole } | null = null;
  for (const [prefix, role] of Object.entries(ROUTE_ROLE_REQUIREMENTS)) {
    if (pathname.startsWith(prefix) && (!best || prefix.length > best.prefix.length)) {
      best = { prefix, role };
    }
  }
  return best?.role ?? "STAFF";
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin")) return;
  if (PUBLIC_ADMIN_PATHS.includes(pathname)) return;

  if (!req.auth) {
    return NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin));
  }

  if (
    pathname !== TWO_FACTOR_SETUP_PATH &&
    needsTwoFactorSetup({
      role: req.auth.user.role,
      twoFactorEnabled: req.auth.user.twoFactorEnabled,
    })
  ) {
    return NextResponse.redirect(new URL(TWO_FACTOR_SETUP_PATH, req.nextUrl.origin));
  }

  if (!canAccess(req.auth.user.role, requiredRoleFor(pathname))) {
    return NextResponse.redirect(new URL("/admin", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*"],
};
