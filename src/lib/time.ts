/**
 * The inverse of `formatMinutes` (src/server/menu/availability.ts, left
 * untouched — this belongs in `src/lib` instead since it's a form-input
 * concern, not part of the availability domain logic itself).
 */

export function parseHHMM(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error(`Not a valid HH:MM time: "${value}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
    throw new Error(`Not a valid HH:MM time: "${value}"`);
  }
  return hours * 60 + minutes;
}
