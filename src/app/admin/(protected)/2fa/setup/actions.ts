"use server";

import { redirect } from "next/navigation";
import { auth, updateSession } from "@/auth";
import { prisma } from "@/server/db";
import { verifyTotpCode } from "@/server/auth/totp";
import { generateRecoveryCodes, hashRecoveryCodes } from "@/server/auth/recovery-codes";
import { recordAuditLog } from "@/server/audit/log";
import { setPendingRecoveryCodesCookie, clearPendingRecoveryCodesCookie } from "./pending-codes-cookie";

/**
 * Verifies the code against the unconfirmed secret the page already
 * generated and stored. On success: generates recovery codes, stores only
 * their hashes, flips `twoFactorEnabled`, refreshes the session JWT (it
 * was minted at login with the old `twoFactorEnabled: false` and won't
 * pick this up on its own — see `src/auth.config.ts`), and hands the
 * plaintext codes to the page's next render via the one-time cookie.
 * Doesn't redirect — letting Next's normal post-action re-render show the
 * updated page state is what makes the cookie handoff work.
 */
export async function confirmTotpAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session) redirect("/admin/login");

  const code = String(formData.get("code") ?? "").trim();
  const staff = await prisma.staffUser.findUnique({ where: { id: session.user.id } });

  if (!staff || !staff.twoFactorSecret || !verifyTotpCode(staff.twoFactorSecret, code)) {
    redirect("/admin/2fa/setup?error=invalid_code");
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashes = await hashRecoveryCodes(recoveryCodes);

  await prisma.staffUser.update({
    where: { id: staff.id },
    data: { twoFactorEnabled: true, twoFactorRecoveryCodeHashes: hashes },
  });

  await updateSession({ user: { twoFactorEnabled: true } });

  await recordAuditLog({
    actorType: "STAFF",
    actorId: staff.id,
    action: "TWO_FACTOR_ENROLLED",
    entityType: "StaffUser",
    entityId: staff.id,
  });

  await setPendingRecoveryCodesCookie(staff.id, recoveryCodes);
}

/** The "I've saved these codes" step — the only place the one-time cookie gets cleared. */
export async function acknowledgeRecoveryCodesAction(): Promise<void> {
  await clearPendingRecoveryCodesCookie();
  redirect("/admin");
}
