/**
 * Money and tax arithmetic.
 *
 * Every amount in this system is an integer number of cents. €8.50 is 850.
 * Floating point is never used for money — 0.1 + 0.2 !== 0.3 is funny in a
 * blog post and expensive in a restaurant.
 *
 * VAT rates are integer basis points: 5% = 500, 9% = 900, 19% = 1900.
 */

export type Cents = number;
export type BasisPoints = number;

export const VAT_FOOD: BasisPoints = 500; // 5%
export const VAT_SOFT_DRINKS: BasisPoints = 900; // 9%
export const VAT_ALCOHOL: BasisPoints = 1900; // 19%

/** Guard against a non-integer or negative amount sneaking in. */
export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
  return value;
}

/**
 * Menu prices are VAT-INCLUSIVE, which is how EU restaurant menus work:
 * the €8.50 on the menu is what the customer pays, tax already inside.
 * So we EXTRACT the tax from the gross rather than adding it on top.
 *
 *   vat = gross × rate / (10000 + rate)
 *
 * €8.50 at 5% → 850 × 500 / 10500 = 40.48 → 40 cents VAT, €8.10 net.
 */
export function vatFromGross(grossCents: Cents, rateBps: BasisPoints): Cents {
  assertCents(grossCents, "grossCents");
  if (rateBps < 0) throw new Error(`VAT rate cannot be negative: ${rateBps}`);
  return Math.round((grossCents * rateBps) / (10000 + rateBps));
}

/** The ex-VAT portion of a VAT-inclusive amount. */
export function netFromGross(grossCents: Cents, rateBps: BasisPoints): Cents {
  return grossCents - vatFromGross(grossCents, rateBps);
}

/** Add VAT to a net amount. Used when a supplier quotes ex-VAT — e.g. Wolt. */
export function grossFromNet(netCents: Cents, rateBps: BasisPoints): Cents {
  assertCents(netCents, "netCents");
  return netCents + Math.round((netCents * rateBps) / 10000);
}

/**
 * Apply a percentage discount expressed in basis points.
 * 1000 bps = 10% off. Rounds to the customer's advantage (down on the
 * amount they pay) and never returns more than the original amount.
 */
export function percentageOf(amountCents: Cents, bps: BasisPoints): Cents {
  assertCents(amountCents, "amountCents");
  const raw = Math.round((amountCents * bps) / 10000);
  return Math.min(raw, amountCents);
}

/** Format for display. 850 → "€8.50". */
export function formatCents(cents: Cents, currency = "EUR"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const symbol = currency === "EUR" ? "€" : `${currency} `;
  return `${sign}${symbol}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parse "8.50" or "8,50" into 850. Used for admin price entry. */
export function parsePriceToCents(input: string): Cents {
  const cleaned = input.trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (cleaned === "" || (cleaned.match(/\./g) ?? []).length > 1) {
    throw new Error(`Cannot parse "${input}" as a price`);
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  if (frac.length > 2) throw new Error(`Too many decimal places in "${input}"`);
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
