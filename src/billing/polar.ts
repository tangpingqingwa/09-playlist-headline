/**
 * Historical compatibility tombstone. This module intentionally has no
 * checkout, webhook, network, or selector implementation. All payment work
 * enters through the explicit Waffo mode in `billing/port.ts`.
 */
export function legacyProviderDisabled(): never {
  throw new Error("BLOCKED-CONFIG: legacy payment provider disabled; use WAFFO_MODE");
}
