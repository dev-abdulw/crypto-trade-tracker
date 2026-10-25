import { d, safeDiv, type Decimal, type Value } from './money';

/**
 * The adjustment that moves `current` to the user's real figure `target`, e.g. 1000 → 1001 is
 * +1 (+0.1%). Rounded to the 8 dp the database stores.
 */
export function adjustmentFor(
  target: Value,
  current: Value,
): { amount: Decimal; pct: Decimal | null } {
  const amount = d(target).minus(current).toDecimalPlaces(8);
  return { amount, pct: d(current).gt(0) ? safeDiv(amount, current) : null };
}

/** % an adjustment represented against the portfolio value it was made from. */
export function adjustmentPct(amount: Value, basis: Value | null | undefined): Decimal | null {
  return basis && d(basis).gt(0) ? d(amount).div(basis) : null;
}
