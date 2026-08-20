/**
 * The staff session payload, and the role hierarchy check built on it.
 *
 * There are exactly two roles (`StaffRole` in schema.prisma): `STAFF` can
 * see and progress orders; `OWNER` can additionally touch menu, pricing,
 * promotions, settings, analytics and refunds. That's a strict hierarchy,
 * not two disjoint permission sets — an OWNER is not locked out of
 * STAFF-level pages. `canAccess` encodes that once so route guards
 * (`middleware.ts`, and later individual admin routes) never have to
 * hand-roll an `if (role === "OWNER" || role === "STAFF")` check that's
 * easy to get backwards.
 */

import type { StaffRole } from "@prisma/client";

export type StaffSession = {
  staffId: string;
  email: string;
  name: string;
  role: StaffRole;
  twoFactorEnabled: boolean;
};

/** Higher number outranks lower. `OWNER` outranks `STAFF`. */
const ROLE_RANK: Record<StaffRole, number> = {
  STAFF: 0,
  OWNER: 1,
};

/** Does a staff member holding `actual` satisfy a page/action requiring `required`? */
export function canAccess(actual: StaffRole, required: StaffRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * OWNER requires 2FA (architecture doc H.3) — STAFF never does, the
 * kitchen tablet can't reasonably prompt for a TOTP code every shift.
 * `middleware.ts` uses this to redirect an un-enrolled OWNER to
 * `/admin/2fa/setup` before letting them reach anything else.
 */
export function needsTwoFactorSetup(staff: { role: StaffRole; twoFactorEnabled: boolean }): boolean {
  return staff.role === "OWNER" && !staff.twoFactorEnabled;
}
