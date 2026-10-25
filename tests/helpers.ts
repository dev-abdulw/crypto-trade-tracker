import type { Decimal } from '../src/lib/money';
import type { FillInput } from '../src/lib/pnl';

let seq = 0;

/** Local-time date, so month/day boundaries are time-zone independent in tests. */
export function at(year: number, month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute);
}

type FeeFields = Pick<FillInput, 'fee_amount' | 'fee_asset' | 'fee_usdt'>;

export function buy(
  qty: string | number,
  price: string | number,
  when: Date,
  fee: FeeFields = {},
): FillInput {
  return {
    id: `f${++seq}`,
    side: 'buy',
    quantity: qty,
    price_usdt: price,
    executed_at: when,
    ...fee,
  };
}

export function sell(
  qty: string | number,
  price: string | number,
  when: Date,
  fee: FeeFields = {},
): FillInput {
  return {
    id: `f${++seq}`,
    side: 'sell',
    quantity: qty,
    price_usdt: price,
    executed_at: when,
    ...fee,
  };
}

/** Decimal → plain string (rounded to `dp` places when given) for readable assertions. */
export function s(v: Decimal | null | undefined, dp?: number): string | null {
  if (v === null || v === undefined) return null;
  return dp === undefined ? v.toFixed() : v.toDecimalPlaces(dp).toFixed();
}
