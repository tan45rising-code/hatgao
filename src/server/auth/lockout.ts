/**
 * Login lockout policy.
 *
 * Pure functions over the `failedLoginCount`/`lockedUntil` pair already on
 * `StaffUser` — no I/O here. The caller (the `authorize()` callback in
 * `src/auth.ts`) reads the current row, asks this module what the next
 * state should be, and persists it. Kept separate from the persistence and
 * from Auth.js entirely so the policy itself is testable without a database
 * or an HTTP request, the same way `src/server/orders/state-machine.ts`
 * keeps the transition rules separate from the routes that trigger them.
 */

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 15;

export type LockoutState = {
  failedLoginCount: number;
  lockedUntil: Date | null;
};

/** True while `lockedUntil` is set and still in the future relative to `now`. */
export function isLocked(now: Date, lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * A wrong password just came in for an account that was NOT already locked
 * (callers must check `isLocked` first — this function doesn't re-check,
 * it just advances the count). Increments the streak; once it reaches
 * `MAX_FAILED_ATTEMPTS`, sets `lockedUntil` to `LOCKOUT_DURATION_MINUTES`
 * from now. Below the threshold, `lockedUntil` stays null.
 */
export function recordFailedAttempt(current: LockoutState, now: Date): LockoutState {
  const failedLoginCount = current.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
    return {
      failedLoginCount,
      lockedUntil: new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60_000),
    };
  }
  return { failedLoginCount, lockedUntil: null };
}

/** A correct password clears the streak entirely, locked or not. */
export function recordSuccessfulAttempt(): LockoutState {
  return { failedLoginCount: 0, lockedUntil: null };
}
