/**
 * TOTP (RFC 6238) for OWNER 2FA.
 *
 * A thin wrapper over `otpauth` — pure TS, no native deps, so it can run
 * anywhere Node can (no argon2/Prisma-style edge-runtime concerns here).
 * The rest of the app never touches the `otpauth` library directly, the
 * same "one interface, one implementation" discipline the Wolt module uses
 * (architecture doc G.4).
 */

import * as OTPAuth from "otpauth";

const ISSUER = "Hat Gao Admin";
/** Standard TOTP: 6 digits, 30-second step, SHA-1 — what every authenticator app expects. */
const DIGITS = 6;
const PERIOD = 30;
/** Accept a code from one step before/after now, to absorb clock drift and typing lag. */
const VERIFICATION_WINDOW = 1;

/** A fresh base32 secret for a new (unconfirmed) enrollment. */
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

/**
 * The `otpauth://` URI an authenticator app scans as a QR code.
 * `accountLabel` should be the staff member's email — it's what shows up
 * next to "Hat Gao Admin" in their authenticator app.
 */
export function buildOtpAuthUri(secret: string, accountLabel: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  return totp.toString();
}

/** True if `code` is valid for `secret` at the current time (± one 30s step). */
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // .validate returns the matched time-step delta, or null if no step in
  // the window matches — we only care whether one did.
  return totp.validate({ token: code, window: VERIFICATION_WINDOW }) !== null;
}
