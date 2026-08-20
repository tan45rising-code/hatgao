/**
 * Password hashing for staff accounts.
 *
 * argon2id specifically — not bcrypt, not argon2's own default variant
 * (which is argon2i unless you ask otherwise). argon2id is the mode OWASP
 * recommends for this exact case: a login form an attacker can hit with a
 * stolen password list. We pin the variant explicitly rather than trust the
 * library default, because "the library changed its default in a minor
 * version" is a real way this quietly gets weaker over time.
 */

import * as argon2 from "argon2";

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id });
}

/**
 * Verifies a plaintext password against a stored hash.
 *
 * Never throws on a wrong password — a mismatch is a normal outcome for a
 * login form, not an exceptional one. It only throws if `hash` isn't a
 * well-formed argon2 hash at all (a programmer error, e.g. comparing
 * against an empty string), which callers should let propagate.
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  return argon2.verify(hash, plaintext);
}
