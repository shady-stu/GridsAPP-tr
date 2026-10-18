/**
 * Decimal-money helpers that never touch a JavaScript number.
 *
 * `Number("0.1") + Number("0.2")` is `0.30000000000000004`; in a payments domain that is a bug,
 * not a curiosity. Every amount therefore travels as a string from the request body, through
 * the DTO, into PostgreSQL `DECIMAL(14,2)` and back out again.
 */

/** Matches a non-negative amount with at most two decimal places and at most 12 integer digits. */
export const MONEY_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Pads (never rounds) an already-validated amount to a fixed number of decimal places.
 *
 * ```ts
 * normaliseMoney('199.9')  // '199.90'
 * normaliseMoney('199')    // '199.00'
 * normaliseMoney('199.90') // '199.90'
 * ```
 *
 * Callers must validate with `MONEY_PATTERN` first: a value with more decimals than `scale`
 * is truncated rather than rounded, because silently rounding money is worse than rejecting it.
 */
export function normaliseMoney(value: string, scale = 2): string {
  const trimmed = value.trim();
  const [whole = '0', fraction = ''] = trimmed.split('.');
  const paddedFraction = (fraction + '0'.repeat(scale)).slice(0, scale);
  return `${whole}.${paddedFraction}`;
}
