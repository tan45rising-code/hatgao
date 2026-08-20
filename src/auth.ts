/**
 * Auth.js configuration for staff login — the Node-runtime half.
 *
 * Builds on `src/auth.config.ts` (the edge-safe shared config — see that
 * file for why the split exists) and adds the actual Credentials provider,
 * which is the only piece that needs Prisma, argon2 and TOTP verification.
 * This file must never be imported by `middleware.ts`.
 *
 * JWT session strategy, not database sessions — Auth.js's Credentials
 * provider does its own lookup in `authorize()` and isn't compatible with
 * the database-session strategy (that's for OAuth providers going through
 * the adapter). The session itself ends up as an encrypted, httpOnly,
 * `Secure`, `SameSite=Lax` cookie, which is exactly what H.3 in the
 * architecture doc asks for — Auth.js gives us that by default, nothing
 * extra to configure.
 *
 * `authorize()` is deliberately the only place that touches `StaffUser`
 * directly. The flow, in order:
 *   1. Look up the account, reject if inactive/soft-deleted (generic error).
 *   2. Reject if currently locked out (`src/server/auth/lockout.ts`) —
 *      before even checking the password, so a locked account can't be
 *      used to keep probing passwords.
 *   3. Verify the password. Wrong → advance the lockout counter, generic
 *      error either way (never hint whether the account exists or which
 *      factor was wrong).
 *   4. If 2FA isn't enabled, that's a full login — done.
 *   5. If 2FA IS enabled and no code was submitted yet: throw
 *      `TwoFactorRequiredError`, a distinct, safe-to-expose error code
 *      (see the class below) the login action uses to re-render the form
 *      with a code field. This is a NEUTRAL outcome — it doesn't touch the
 *      lockout counter in either direction, because the password was
 *      genuinely correct.
 *   6. If a code was submitted: try it as a TOTP code, then as a recovery
 *      code. Wrong → advance the lockout counter exactly like a wrong
 *      password would (a 6-digit code is a brute-force target too).
 *      Right → consume the recovery code if that's what matched, and
 *      complete login.
 * Every outcome writes a distinguishable `audit_log` row even though the
 * UI shows one generic error message for all of the failure cases.
 */

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/server/db";
import { verifyPassword } from "@/server/auth/password";
import { isLocked, recordFailedAttempt, recordSuccessfulAttempt } from "@/server/auth/lockout";
import { verifyTotpCode } from "@/server/auth/totp";
import { verifyRecoveryCode } from "@/server/auth/recovery-codes";
import { recordAuditLog } from "@/server/audit/log";

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  // `.nullish()`, not `.optional()`: a FormData field that's absent from
  // the login form (no code yet) comes through as `null` via
  // `formData.get("code")`, not `undefined` — `.optional()` alone rejects
  // `null` and fails the whole parse, silently returning null from
  // authorize() before ever reaching the 2FA branch below. Cost real time
  // to track down — every first-step login against a 2FA account was
  // failing with the generic error instead of prompting for a code.
  code: z.string().trim().nullish(),
});

/**
 * Thrown when the password was correct but the account has 2FA enabled and
 * no code was submitted yet. `.type` is Auth.js's designated safe-to-expose
 * error identifier (see `CredentialsSignin`'s own doc comment) — the login
 * action checks it to decide whether to show the code field, as opposed to
 * a generic "invalid credentials" message.
 */
export class TwoFactorRequiredError extends CredentialsSignin {
  static override type = "TwoFactorRequired";
}

export const { handlers, signIn, signOut, auth, unstable_update: updateSession } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        code: { label: "Code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, code } = parsed.data;
        const now = new Date();

        const staff = await prisma.staffUser.findUnique({ where: { email } });

        if (!staff || !staff.isActive || staff.deletedAt) {
          await recordAuditLog({
            actorType: "STAFF",
            action: "LOGIN_FAILURE",
            entityType: "StaffUser",
            entityId: staff?.id ?? null,
          });
          return null;
        }

        if (isLocked(now, staff.lockedUntil)) {
          await recordAuditLog({
            actorType: "STAFF",
            actorId: staff.id,
            action: "LOGIN_BLOCKED_LOCKED",
            entityType: "StaffUser",
            entityId: staff.id,
          });
          return null;
        }

        const passwordOk = await verifyPassword(staff.passwordHash, password);

        if (!passwordOk) {
          const next = recordFailedAttempt(staff, now);
          await prisma.staffUser.update({ where: { id: staff.id }, data: next });
          await recordAuditLog({
            actorType: "STAFF",
            actorId: staff.id,
            action: next.lockedUntil ? "LOGIN_FAILURE_LOCKED_OUT" : "LOGIN_FAILURE",
            entityType: "StaffUser",
            entityId: staff.id,
          });
          return null;
        }

        // Password confirmed correct. From here on, failures are about the
        // second factor, not the password.
        if (staff.twoFactorEnabled) {
          if (!code) {
            await recordAuditLog({
              actorType: "STAFF",
              actorId: staff.id,
              action: "LOGIN_PASSWORD_OK_2FA_PENDING",
              entityType: "StaffUser",
              entityId: staff.id,
            });
            throw new TwoFactorRequiredError();
          }

          const totpOk = staff.twoFactorSecret
            ? verifyTotpCode(staff.twoFactorSecret, code)
            : false;
          const usedRecoveryHash = totpOk
            ? null
            : await verifyRecoveryCode(staff.twoFactorRecoveryCodeHashes, code);

          if (!totpOk && !usedRecoveryHash) {
            const next = recordFailedAttempt(staff, now);
            await prisma.staffUser.update({ where: { id: staff.id }, data: next });
            await recordAuditLog({
              actorType: "STAFF",
              actorId: staff.id,
              action: next.lockedUntil ? "LOGIN_FAILURE_2FA_LOCKED_OUT" : "LOGIN_FAILURE_2FA",
              entityType: "StaffUser",
              entityId: staff.id,
            });
            return null;
          }

          if (usedRecoveryHash) {
            await prisma.staffUser.update({
              where: { id: staff.id },
              data: {
                twoFactorRecoveryCodeHashes: staff.twoFactorRecoveryCodeHashes.filter(
                  (h) => h !== usedRecoveryHash,
                ),
              },
            });
            await recordAuditLog({
              actorType: "STAFF",
              actorId: staff.id,
              action: "RECOVERY_CODE_USED",
              entityType: "StaffUser",
              entityId: staff.id,
            });
          }
        }

        const next = recordSuccessfulAttempt();
        await prisma.staffUser.update({
          where: { id: staff.id },
          data: { ...next, lastLoginAt: now },
        });
        await recordAuditLog({
          actorType: "STAFF",
          actorId: staff.id,
          action: "LOGIN_SUCCESS",
          entityType: "StaffUser",
          entityId: staff.id,
        });

        return {
          id: staff.id,
          email: staff.email,
          name: staff.name,
          role: staff.role,
          twoFactorEnabled: staff.twoFactorEnabled,
        };
      },
    }),
  ],
});
