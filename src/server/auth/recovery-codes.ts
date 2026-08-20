/**
 * One-time 2FA recovery codes.
 *
 * The failure mode this exists for: an OWNER loses their phone. With one
 * owner and no second admin account, that's otherwise "locked out of your
 * own admin panel until someone runs a DB script" — worse than the 2FA gap
 * it protects against. Ten codes at enrollment, each usable once.
 *
 * Codes are generated here but hashed with the same argon2id helper
 * passwords use (`src/server/auth/password.ts`) — a leaked
 * `twoFactorRecoveryCodeHashes` column should be exactly as useless to an
 * attacker as a leaked `passwordHash` column.
 */

import { randomInt } from "node:crypto";
import { hashPassword, verifyPassword } from "@/server/auth/password";

export const RECOVERY_CODE_COUNT = 10;

// No 0/O/1/I — characters that get misread when someone is copying a code
// off a screen onto a sticky note, which is exactly how these get used.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const SEGMENT_LENGTH = 5;

function randomSegment(): string {
  let out = "";
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Ten fresh plaintext codes, formatted `XXXXX-XXXXX`. Shown to the user exactly once. */
export function generateRecoveryCodes(count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => `${randomSegment()}-${randomSegment()}`);
}

/** Hash a batch of plaintext codes for storage. Never store the plaintext. */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => hashPassword(normalize(code))));
}

/**
 * Checks `code` against the stored hashes. Returns the specific hash that
 * matched (so the caller can remove exactly that one — single use), or
 * null if none matched. Case-insensitive and tolerant of the dash being
 * left out, since this is typed under stress from a printed backup sheet.
 */
export async function verifyRecoveryCode(
  hashes: string[],
  code: string,
): Promise<string | null> {
  const normalized = normalize(code);
  for (const hash of hashes) {
    if (await verifyPassword(hash, normalized)) return hash;
  }
  return null;
}

function normalize(code: string): string {
  const stripped = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const first = stripped.slice(0, SEGMENT_LENGTH);
  const second = stripped.slice(SEGMENT_LENGTH, SEGMENT_LENGTH * 2);
  return second ? `${first}-${second}` : first;
}
