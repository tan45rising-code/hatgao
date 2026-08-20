/**
 * Extends Auth.js's built-in Session/JWT types with the staff fields our
 * `jwt`/`session` callbacks in `src/auth.ts` actually put there. Without
 * this, every read of `session.user.role` needs an `as` cast.
 *
 * Augmentation targets `@auth/core/types` and `@auth/core/jwt` directly,
 * NOT `next-auth`/`next-auth/jwt` — those two packages only re-export the
 * `Session`/`User`/`JWT` interfaces (`export type {...} from "@auth/core/..."`),
 * they don't declare them. Declaration merging has to point at the module
 * where the `interface` is actually declared; augmenting the re-exporting
 * facade silently creates an unrelated shadow type that nothing (including
 * the callback params Auth.js hands you) actually uses.
 */

import type { StaffRole } from "@prisma/client";

declare module "@auth/core/types" {
  interface Session {
    user: {
      id: string;
      role: StaffRole;
      twoFactorEnabled: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: StaffRole;
    twoFactorEnabled: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    staffId?: string;
    role?: StaffRole;
    twoFactorEnabled?: boolean;
  }
}
