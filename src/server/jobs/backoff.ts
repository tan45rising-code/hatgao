/**
 * Retry backoff schedule for the job queue. Pure function, no DB/clock
 * dependency beyond what's passed in, so it's covered by the same
 * DB-free domain test harness as the pricing/state-machine logic
 * (`tests/unit/domain.test.ts`) rather than needing a real `Job` row.
 *
 * A fixed table rather than a formula (`2^attempts`, etc.) — five
 * attempts is few enough that spelling out the actual wait at each step
 * is more readable than a derivation, and it's easy to change one step
 * without reasoning about the curve.
 */

const BACKOFF_MINUTES = [1, 5, 15, 60] as const;

/**
 * `attempts` is the count AFTER the failure being scheduled for retry
 * (i.e. the value already incremented). Returns `null` once `attempts`
 * has reached `maxAttempts` — the caller should mark the job `DEAD`
 * instead of rescheduling it.
 */
export function nextRunAfter(attempts: number, maxAttempts: number, now: Date = new Date()): Date | null {
  if (attempts >= maxAttempts) return null;

  const step = attempts - 1;
  const lastStepMinutes = 60; // BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1], spelled out so the fallback below is provably defined
  const stepMinutes = step < BACKOFF_MINUTES.length ? (BACKOFF_MINUTES[step] ?? lastStepMinutes) : lastStepMinutes;
  return new Date(now.getTime() + stepMinutes * 60_000);
}
