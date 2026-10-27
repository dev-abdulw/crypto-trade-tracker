import Decimal from 'decimal.js';

/** Decimal constructor used for all money/quantity math in the app. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type { Decimal };
export type Value = Decimal.Value;

export const ZERO = new Dec(0);

export function d(v: Value | null | undefined): Decimal {
  return new Dec(v ?? 0);
}

export function sum(values: Iterable<Value>): Decimal {
  let total: Decimal = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}

/** a / b, or null when b is zero. */
export function safeDiv(a: Value, b: Value): Decimal | null {
  const den = d(b);
  return den.isZero() ? null : d(a).div(den);
}

export function max(a: Decimal, b: Decimal): Decimal {
  return a.gte(b) ? a : b;
}

// ---------- formatting (display only) ----------

const usdtFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** USDT with 2 decimals, e.g. "1,234.56". `sign` adds a leading "+" for positives. */
export function formatUsdt(v: Value | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v === null || v === undefined) return '—';
  const n = d(v).toDecimalPlaces(2);
  const s = usdtFmt.format(n.abs().toNumber());
  if (n.isNegative() && !n.isZero()) return `-${s}`;
  return opts.sign && n.gt(0) ? `+${s}` : s;
}

/** Quantity with up to 8 decimals, trailing zeros trimmed. */
export function formatQty(v: Value | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const [int = '0', frac] = d(v).toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed().split('.');
  const intGrouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${intGrouped}.${frac}` : intGrouped;
}

/** Price with precision adapted to its size (small coins get more digits). */
export function formatPrice(v: Value | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = d(v);
  const abs = n.abs();
  if (abs.gte(1000)) return usdtFmt.format(n.toNumber());
  if (abs.gte(1)) return n.toDecimalPlaces(4).toFixed();
  if (abs.isZero()) return '0';
  return n.toSignificantDigits(4).toFixed();
}

/** Ratio → percent string, e.g. 0.1234 → "+12.34%". */
export function formatPct(
  v: Value | null | undefined,
  opts: { sign?: boolean } = { sign: true },
): string {
  if (v === null || v === undefined) return '—';
  const n = d(v).times(100).toDecimalPlaces(2);
  const s = `${n.abs().toFixed(2)}%`;
  if (n.isNegative() && !n.isZero()) return `-${s}`;
  return opts.sign && n.gt(0) ? `+${s}` : s;
}

const rsFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Rupees with lakh grouping, e.g. 3104592 → "Rs 31,04,592". */
export function formatRs(v: Value | null | undefined, opts: { sign?: boolean } = {}): string {
  if (v === null || v === undefined) return '—';
  const n = d(v).toDecimalPlaces(0);
  const s = `Rs ${rsFmt.format(n.abs().toNumber())}`;
  if (n.isNegative() && !n.isZero()) return `-${s}`;
  return opts.sign && n.gt(0) ? `+${s}` : s;
}

/** 3104592 → "31.05 lakh"; 12500000 → "1.25 crore". */
export function formatLakh(v: Value): string {
  const n = d(v);
  return n.abs().gte(10_000_000)
    ? `${n.div(10_000_000).toDecimalPlaces(2).toFixed()} crore`
    : `${n.div(100_000).toDecimalPlaces(2).toFixed()} lakh`;
}
