import Decimal from 'decimal.js';
import { d, type Value } from './money';

// Pure helpers behind the fill form: parsing inputs, USDT-amount → qty, fee conversion.

/** Parses a user-typed decimal ("1,234.5" or "0.01"); null if empty or invalid. */
export function parseDecimal(input: string | null | undefined): Decimal | null {
  const s = (input ?? '').trim().replace(/,/g, '');
  if (!s) return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  try {
    return d(s);
  } catch {
    return null;
  }
}

/** Quantity bought for a USDT amount at a price, rounded down to the 12 dp the DB stores. */
export function qtyFromAmount(amountUsdt: Value, price: Value): Decimal {
  return d(amountUsdt).div(price).toDecimalPlaces(12, Decimal.ROUND_DOWN);
}

/**
 * Fee converted to USDT: USDT as is, the traded coin at the fill price, BNB at the BNB price.
 * Returns null when a BNB price is needed but missing.
 */
export function feeToUsdt(args: {
  feeAmount: Value;
  feeAsset: string;
  symbol: string;
  price: Value;
  bnbPrice?: Value | null;
}): Decimal | null {
  const fee = d(args.feeAmount);
  if (fee.isZero()) return fee;
  const asset = args.feeAsset.toUpperCase();
  if (asset === 'USDT') return fee;
  if (asset === args.symbol.toUpperCase()) return fee.times(args.price);
  if (asset === 'BNB') return args.bnbPrice ? fee.times(args.bnbPrice) : null;
  return null;
}

/** Suggested fee amount (in `feeAsset`) for a fill at the given percent rate. */
export function estimateFee(args: {
  qty: Value;
  price: Value;
  feeAsset: string;
  symbol: string;
  ratePct: Value;
  bnbPrice?: Value | null;
}): Decimal | null {
  const rate = d(args.ratePct).div(100);
  const asset = args.feeAsset.toUpperCase();
  if (asset === 'USDT') return d(args.qty).times(args.price).times(rate).toDecimalPlaces(8);
  if (asset === args.symbol.toUpperCase()) return d(args.qty).times(rate).toDecimalPlaces(12);
  if (asset === 'BNB' && args.bnbPrice && d(args.bnbPrice).gt(0)) {
    return d(args.qty).times(args.price).times(rate).div(args.bnbPrice).toDecimalPlaces(8);
  }
  return null;
}
