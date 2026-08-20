/**
 * Carries freshly generated recovery codes from the confirm action to the
 * page's very next render, without ever putting them in a URL or the
 * database (only their argon2id hashes are ever persisted — see
 * `src/server/auth/recovery-codes.ts`).
 *
 * This is an HTTP concern (cookies), not business logic, so it lives next
 * to the route that's its only caller rather than in `src/server/`.
 *
 * Encrypted, not just signed: a signed-only JWT's payload is trivially
 * base64-readable by anything that captures the `Set-Cookie` header (a
 * logging proxy, a browser extension). Encrypting costs one extra `jose`
 * call and means the plaintext codes exist in exactly two places for their
 * ~2-minute life: the user's screen, and this cookie.
 *
 * Next.js only allows mutating cookies from a Server Action or Route
 * Handler, never during a page's render — so setting this cookie happens
 * in the confirm action, and clearing it happens in a separate explicit
 * "I've saved these" acknowledge action, not automatically on read. The
 * page's render only reads it.
 */

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { EncryptJWT, jwtDecrypt } from "jose";

const COOKIE_NAME = "hatgao_pending_recovery_codes";
const TTL_SECONDS = 120;

function encryptionKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  // A distinct 256-bit key derived from the same secret Auth.js uses for
  // session cookies, but with different `info` — not the same key.
  return createHash("sha256").update(`hatgao-recovery-codes:${secret}`).digest();
}

export async function setPendingRecoveryCodesCookie(
  staffId: string,
  codes: string[],
): Promise<void> {
  const jwt = await new EncryptJWT({ staffId, codes })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .encrypt(encryptionKey());

  (await cookies()).set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_SECONDS,
    path: "/admin/2fa/setup",
  });
}

/** Read-only — does not clear the cookie. Safe to call during a page render. */
export async function readPendingRecoveryCodesCookie(staffId: string): Promise<string[] | null> {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, encryptionKey());
    if (payload.staffId !== staffId) return null;
    return payload.codes as string[];
  } catch {
    return null;
  }
}

/** Only callable from a Server Action — see `acknowledgeRecoveryCodesAction`. */
export async function clearPendingRecoveryCodesCookie(): Promise<void> {
  // The `path` here must match the one used in `.set()` above — a
  // path-scoped cookie silently fails to clear otherwise (the browser
  // treats a delete at a different path as a no-op against this cookie,
  // not a match), and the "one-time" codes screen would keep reappearing.
  (await cookies()).delete({ name: COOKIE_NAME, path: "/admin/2fa/setup" });
}
