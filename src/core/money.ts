export const MIN_BID_USD = 5;

/** Convert a whole-dollar bid to its exact minor-unit representation. */
export function usdToCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("money must be a non-negative whole dollar amount");
  }
  return value * 100;
}

/** Waffo's display-price contract: no floating point formatting. */
export function centsToDisplayString(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error("money must be a non-negative integer number of cents");
  }
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}

/** Parse a decimal display amount without binary floating point. */
export function displayStringToCents(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
    return undefined;
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(`${whole}${fraction.padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : undefined;
}
