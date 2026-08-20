/**
 * Turns a product/category name into a URL-safe, unique-friendly slug.
 * Pure and deterministic — no DB lookup here (uniqueness is a database
 * constraint, `@unique` on `slug` in schema.prisma; this just produces a
 * good candidate for the form to prefill and the admin to edit).
 */

// Unicode combining diacritical marks (U+0300-U+036F) — built via
// RegExp + fromCharCode rather than a regex literal, so the source file
// contains only plain ASCII instead of an invisible combining character
// sitting between two brackets.
const COMBINING_MARKS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  "g",
);

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD") // separate accents from their base letters ("é" → "e" + combining mark)
    .replace(COMBINING_MARKS, "") // drop the combining marks, keeping the base letters
    .replace(/[^a-z0-9]+/g, "-") // anything not alphanumeric becomes a separator
    .replace(/^-+|-+$/g, ""); // no leading/trailing dashes
}
