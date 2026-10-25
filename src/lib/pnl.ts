import { d, safeDiv, sum, ZERO, type Decimal, type Value } from './money';

// Pure P&L engine (PLAN.md 2.3 / 2.4). No Supabase or React dependencies.

export type Side = 'buy' | 'sell';

export interface FillInput {
  id: string;
  side: Side;
  quantity: Value;
  price_usdt: Value;
  fee_amount?: Value | null;
  fee_asset?: string | null;
  fee_usdt?: Value | null;
  executed_at: string | Date;
}

export interface CapitalFlowInput {
  id?: string;
  type: 'deposit' | 'withdrawal';
  amount_usdt: Value;
  occurred_at: string | Date;
}

export interface DustOptions {
  /** Remaining holdings worth less than this (USDT) count as dust. */
  minValueUsdt?: Value;
  /** Remaining qty below this fraction of total bought qty counts as dust. */
  minFractionOfBought?: Value;
}

export const DEFAULT_DUST: Required<DustOptions> = {
  minValueUsdt: 1,
  minFractionOfBought: '0.001',
};

/** Quantities are stored as numeric(30,12); anything below this is rounding noise. */
const QTY_EPSILON = d('1e-12');

export class OversellError extends Error {
  constructor(
    public readonly fillId: string,
    public readonly available: Decimal,
    public readonly requested: Decimal,
  ) {
    super(
      `Sell of ${requested.toFixed()} exceeds remaining quantity ${available.toFixed()} (fill ${fillId})`,
    );
    this.name = 'OversellError';
  }
}

/** One realized P&L event: a sell, or the write-off of dust when a position is closed. */
export interface Realization {
  kind: 'sell' | 'writeoff';
  fillId: string | null;
  at: Date;
  /** Coin quantity that left the position (incl. coin-paid fee on a sell). */
  quantity: Decimal;
  proceeds: Decimal;
  costBasis: Decimal;
  realizedPnl: Decimal;
  pnlPct: Decimal | null;
  /** Average entry price at the moment of this realization. */
  avgEntry: Decimal;
}

export interface TimelineEntry {
  fillId: string;
  side: Side;
  at: Date;
  quantity: Decimal;
  price: Decimal;
  feeUsdt: Decimal;
  /** Change to held quantity (net of coin-paid fees; negative for sells). */
  qtyChange: Decimal;
  avgEntryAfter: Decimal;
  remainingQtyAfter: Decimal;
  realizedPnl: Decimal | null;
}

export interface PositionSummary {
  status: 'open' | 'closed';
  closedAt: Date | null;
  firstFillAt: Date | null;
  lastFillAt: Date | null;
  holdingTimeMs: number;

  totalBoughtQty: Decimal;
  totalCost: Decimal;
  /** Running fee-inclusive average entry of current holdings (last value once flat). */
  avgEntry: Decimal;
  /** totalCost / totalBoughtQty across all buys. */
  overallAvgEntry: Decimal | null;

  soldQty: Decimal;
  proceeds: Decimal;
  costOfSold: Decimal;
  realizedPnl: Decimal;
  pnlPct: Decimal | null;

  remainingQty: Decimal;
  openCost: Decimal;
  writtenOffQty: Decimal;

  livePrice: Decimal | null;
  marketValue: Decimal | null;
  unrealizedPnl: Decimal | null;
  unrealizedPct: Decimal | null;

  feesUsdt: Decimal;
  fees: { at: Date; feeUsdt: Decimal }[];
  realizations: Realization[];
  timeline: TimelineEntry[];
}

export interface ComputePositionOptions {
  symbol: string;
  livePrice?: Value | null;
  dust?: DustOptions;
  /** Set when the user closed the position by hand; leftover qty is written off. */
  manualCloseAt?: string | Date | null;
}

export function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

/** Fills in time order; at equal timestamps buys go first so a same-second sell isn't rejected. */
export function sortFills<T extends FillInput>(fills: readonly T[]): T[] {
  return fills
    .map((f, i) => ({ f, i, t: toDate(f.executed_at).getTime() }))
    .sort((a, b) => a.t - b.t || sideRank(a.f.side) - sideRank(b.f.side) || a.i - b.i)
    .map((x) => x.f);
}

function sideRank(side: Side): number {
  return side === 'buy' ? 0 : 1;
}

function isFeeInCoin(fill: FillInput, symbol: string): boolean {
  return (
    !!fill.fee_asset &&
    fill.fee_asset.toUpperCase() === symbol.toUpperCase() &&
    d(fill.fee_amount).gt(0)
  );
}

export function isDust(
  remainingQty: Value,
  price: Value | null,
  totalBoughtQty: Value,
  opts: DustOptions = {},
): boolean {
  const rem = d(remainingQty);
  if (rem.lte(QTY_EPSILON)) return false;
  const { minValueUsdt, minFractionOfBought } = { ...DEFAULT_DUST, ...opts };
  if (price !== null && rem.times(price).lt(minValueUsdt)) return true;
  return rem.lt(d(totalBoughtQty).times(minFractionOfBought));
}

export function computePosition(
  fills: readonly FillInput[],
  opts: ComputePositionOptions,
): PositionSummary {
  const sorted = sortFills(fills);

  let qty: Decimal = ZERO; // currently held
  let cost: Decimal = ZERO; // cost basis of currently held qty
  let avg: Decimal = ZERO;
  let totalBoughtQty: Decimal = ZERO;
  let totalCost: Decimal = ZERO;
  let soldQty: Decimal = ZERO;
  let lastSellAt: Date | null = null;

  const realizations: Realization[] = [];
  const timeline: TimelineEntry[] = [];
  const fees: { at: Date; feeUsdt: Decimal }[] = [];

  for (const fill of sorted) {
    const at = toDate(fill.executed_at);
    const fillQty = d(fill.quantity);
    const price = d(fill.price_usdt);
    const feeUsdt = d(fill.fee_usdt);
    const feeInCoin = isFeeInCoin(fill, opts.symbol);
    const coinFee = feeInCoin ? d(fill.fee_amount) : ZERO;
    if (!feeUsdt.isZero()) fees.push({ at, feeUsdt });

    if (fill.side === 'buy') {
      // A coin-paid fee shrinks what we receive; its cost is already inside qty × price,
      // so it is NOT added to cost again. USDT/BNB fees are added to cost.
      const netQty = fillQty.minus(coinFee);
      const costAdd = fillQty.times(price).plus(feeInCoin ? ZERO : feeUsdt);
      qty = qty.plus(netQty);
      cost = cost.plus(costAdd);
      totalBoughtQty = totalBoughtQty.plus(netQty);
      totalCost = totalCost.plus(costAdd);
      avg = qty.isZero() ? avg : cost.div(qty);
      timeline.push({
        fillId: fill.id,
        side: 'buy',
        at,
        quantity: fillQty,
        price,
        feeUsdt,
        qtyChange: netQty,
        avgEntryAfter: avg,
        remainingQtyAfter: qty,
        realizedPnl: null,
      });
      continue;
    }

    // Sell: a coin-paid fee consumes extra coin on top of the sold qty.
    const consumed = fillQty.plus(coinFee);
    if (consumed.gt(qty.plus(QTY_EPSILON))) {
      throw new OversellError(fill.id, qty, consumed);
    }
    const costBasis = consumed.gte(qty) ? cost : consumed.times(avg);
    const proceeds = fillQty.times(price).minus(feeInCoin ? ZERO : feeUsdt);
    const realizedPnl = proceeds.minus(costBasis);
    realizations.push({
      kind: 'sell',
      fillId: fill.id,
      at,
      quantity: consumed,
      proceeds,
      costBasis,
      realizedPnl,
      pnlPct: safeDiv(realizedPnl, costBasis),
      avgEntry: avg,
    });
    soldQty = soldQty.plus(consumed);
    qty = qty.minus(consumed);
    cost = cost.minus(costBasis);
    if (qty.lte(QTY_EPSILON)) {
      qty = ZERO;
      cost = ZERO;
    }
    lastSellAt = at;
    timeline.push({
      fillId: fill.id,
      side: 'sell',
      at,
      quantity: fillQty,
      price,
      feeUsdt,
      qtyChange: consumed.neg(),
      avgEntryAfter: avg,
      remainingQtyAfter: qty,
      realizedPnl,
    });
  }

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstFillAt = first ? toDate(first.executed_at) : null;
  const lastFillAt = last ? toDate(last.executed_at) : null;
  const livePrice =
    opts.livePrice === null || opts.livePrice === undefined ? null : d(opts.livePrice);
  const lastPrice = last ? d(last.price_usdt) : null;

  // Closing rules: fully sold, dust left after selling, or closed by hand.
  let closedAt: Date | null = null;
  if (opts.manualCloseAt) {
    closedAt = toDate(opts.manualCloseAt);
  } else if (lastSellAt) {
    if (qty.isZero()) closedAt = lastFillAt;
    else if (isDust(qty, livePrice ?? lastPrice, totalBoughtQty, opts.dust)) closedAt = lastSellAt;
  }

  let writtenOffQty: Decimal = ZERO;
  if (closedAt && qty.gt(0)) {
    realizations.push({
      kind: 'writeoff',
      fillId: null,
      at: closedAt,
      quantity: qty,
      proceeds: ZERO,
      costBasis: cost,
      realizedPnl: cost.neg(),
      pnlPct: cost.isZero() ? null : d(-1),
      avgEntry: avg,
    });
    writtenOffQty = qty;
    qty = ZERO;
    cost = ZERO;
  }

  const proceeds = sum(realizations.map((r) => r.proceeds));
  const costOfSold = sum(realizations.map((r) => r.costBasis));
  const realizedPnl = sum(realizations.map((r) => r.realizedPnl));

  const hasHoldings = qty.gt(0);
  const marketValue = hasHoldings && livePrice ? qty.times(livePrice) : null;
  const unrealizedPnl = marketValue ? marketValue.minus(cost) : null;

  return {
    status: closedAt ? 'closed' : 'open',
    closedAt,
    firstFillAt,
    lastFillAt,
    holdingTimeMs:
      firstFillAt && lastFillAt
        ? Math.max(0, (closedAt ?? lastFillAt).getTime() - firstFillAt.getTime())
        : 0,
    totalBoughtQty,
    totalCost,
    avgEntry: avg,
    overallAvgEntry: safeDiv(totalCost, totalBoughtQty),
    soldQty,
    proceeds,
    costOfSold,
    realizedPnl,
    pnlPct: safeDiv(realizedPnl, costOfSold),
    remainingQty: qty,
    openCost: cost,
    writtenOffQty,
    livePrice,
    marketValue,
    unrealizedPnl,
    unrealizedPct: unrealizedPnl ? safeDiv(unrealizedPnl, cost) : null,
    feesUsdt: sum(fees.map((f) => f.feeUsdt)),
    fees,
    realizations,
    timeline,
  };
}

/**
 * Validates a prospective sell against existing fills. Returns null when OK, otherwise an
 * error message. Use it in forms before saving.
 */
export function validateSell(
  existing: readonly FillInput[],
  sell: FillInput,
  opts: ComputePositionOptions,
): string | null {
  try {
    computePosition([...existing, { ...sell, side: 'sell' }], opts);
    return null;
  } catch (e) {
    if (e instanceof OversellError) {
      return `You only hold ${e.available.toFixed()} — cannot sell ${e.requested.toFixed()}.`;
    }
    throw e;
  }
}

// ---------- account level (2.4) ----------

export interface AccountSummary {
  deposits: Decimal;
  withdrawals: Decimal;
  netInvested: Decimal;
  realizedTotal: Decimal;
  capital: Decimal;
  openCost: Decimal;
  cashUsdt: Decimal;
  holdingsValue: Decimal;
  unrealizedPnl: Decimal;
  portfolioValue: Decimal;
  totalReturn: Decimal;
  totalReturnPct: Decimal | null;
  /** Open positions valued at cost because no live price was available. */
  missingPrices: number;
}

/** Signed sum of flows (deposits +, withdrawals −), optionally only those before `before`. */
export function netFlows(flows: readonly CapitalFlowInput[], before?: Date): Decimal {
  return sum(
    flows
      .filter((f) => !before || toDate(f.occurred_at) < before)
      .map((f) => (f.type === 'deposit' ? d(f.amount_usdt) : d(f.amount_usdt).neg())),
  );
}

export function computeAccount(
  flows: readonly CapitalFlowInput[],
  positions: readonly PositionSummary[],
): AccountSummary {
  const deposits = sum(flows.filter((f) => f.type === 'deposit').map((f) => f.amount_usdt));
  const withdrawals = sum(flows.filter((f) => f.type === 'withdrawal').map((f) => f.amount_usdt));
  const netInvested = deposits.minus(withdrawals);
  const realizedTotal = sum(positions.map((p) => p.realizedPnl));
  const capital = netInvested.plus(realizedTotal);

  const open = positions.filter((p) => p.status === 'open' && p.remainingQty.gt(0));
  const openCost = sum(open.map((p) => p.openCost));
  let missingPrices = 0;
  const holdingsValue = sum(
    open.map((p) => {
      if (p.marketValue) return p.marketValue;
      missingPrices++;
      return p.openCost;
    }),
  );

  const cashUsdt = capital.minus(openCost);
  const portfolioValue = cashUsdt.plus(holdingsValue);
  const totalReturn = portfolioValue.minus(netInvested);

  return {
    deposits,
    withdrawals,
    netInvested,
    realizedTotal,
    capital,
    openCost,
    cashUsdt,
    holdingsValue,
    unrealizedPnl: holdingsValue.minus(openCost),
    portfolioValue,
    totalReturn,
    totalReturnPct: safeDiv(totalReturn, netInvested),
    missingPrices,
  };
}
