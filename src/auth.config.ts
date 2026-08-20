/**
 * The edge-safe half of the Auth.js config.
 *
 * `middleware.ts` runs in the Edge runtime, which cannot load Prisma Client
 * or argon2 (both are Node-only — argon2 is a native addon). Splitting the
 * config this way keeps everything Node-only (the Credentials provider's
 * `authorize()`, which touches the database and hashes passwords) out of
 * `auth.config.ts` entirely, so `middleware.ts` can build its own
 * `NextAuth()` instance from just this file without ever importing them.
 * `src/auth.ts` re-uses this config and adds the real provider on top for
 * everywhere else (server components, route handlers, server actions),
 * all of which run in the Node runtime.
 *
 * The `jwt`/`session` callbacks live here, not in `src/auth.ts`, because
 * middleware needs them too — decoding `staffId`/`role` off an existing
 * session cookie doesn't require touching the database, only reading a
 * JWT that was already populated at sign-in time.
 */

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.staffId = user.id;
        token.role = user.role;
        token.twoFactorEnabled = user.twoFactorEnabled;
      }
      // The JWT is minted once at sign-in and doesn't refresh itself — if
      // 2FA gets enrolled mid-session, the cookie would otherwise keep
      // saying `twoFactorEnabled: false` until the next login, and
      // middleware would redirect to the setup page forever. The
      // enrollment action calls `updateSession()` (src/auth.ts) to push
      // this update in place.
      if (trigger === "update" && typeof session?.user?.twoFactorEnabled === "boolean") {
        token.twoFactorEnabled = session.user.twoFactorEnabled;
      }
      return token;
    },
    session({ session, token }) {
      if (token.staffId) session.user.id = token.staffId;
      if (token.role) session.user.role = token.role;
      if (token.twoFactorEnabled !== undefined) {
        session.user.twoFactorEnabled = token.twoFactorEnabled;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
