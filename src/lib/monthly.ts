import {
  addMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  isSameDay,
  parse,
  startOfMonth,
} from 'date-fns';
import { d, safeDiv, sum, ZERO, type Decimal } from './money';
import {
  netFlows,
  toDate,
  type AdjustmentInput,
  type CapitalFlowInput,
  type PositionSummary,
} from './pnl';

// Monthly aggregation (PLAN.md 2.5). Months are in the browser's local time zone.

export type TradeStyle = 'day' | 'swing';

export interface PositionForReport {
  id: string;
  symbol: string;
  /** Manual tag; when absent it is derived from open/close dates. */
  style?: TradeStyle | null;
  summary: PositionSummary;
}

export interface TradeStat {
  positionId: string;
  symbol: string;
  realizedPnl: Decimal;
  pnlPct: Decimal | null;
  style: TradeStyle;
  closedAt: Date;
}

export interface MonthlyReport {
  month: string; // yyyy-MM
  start: Date;
  /** Exclusive: first instant of the next month. */
  end: Date;

  /** P&L from sells (and dust write-offs) made this month. */
  realizedPnl: Decimal;
  /** Σ balance adjustments made this month (signed). */
  adjustmentsPnl: Decimal;
  /** realizedPnl + adjustmentsPnl — the month's result. */
  pnl: Decimal;
  /** Modified Dietz: pnl / (start capital + time-weighted flows). */
  returnPct: Decimal | null;
  /** pnl / start capital. */
  simpleReturnPct: Decimal | null;

  startCapital: Decimal;
  endCapital: Decimal;
  deposits: Decimal;
  withdrawals: Decimal;

  closedCount: number;
  wins: number;
  losses: number;
  winRate: Decimal | null;
  avgWin: Decimal | null;
  avgLoss: Decimal | null;
  /** Σ wins / |Σ losses|; null when there are no losses. */
  profitFactor: Decimal | null;
  bestByUsdt: TradeStat | null;
  worstByUsdt: TradeStat | null;
  bestByPct: TradeStat | null;
  worstByPct: TradeStat | null;
  closedTrades: TradeStat[];

  feesUsdt: Decimal;
  pnlByCoin: { symbol: string; pnl: Decimal }[];
  daily: { date: string; pnl: Decimal; cumulative: Decimal }[];
  styleSplit: Record<TradeStyle, { count: number; pnl: Decimal }>;
}

export function monthKey(date: Date | string): string {
  return format(toDate(date), 'yyyy-MM');
}

export function monthStart(key: string): Date {
  return startOfMonth(parse(key, 'yyyy-MM', new Date()));
}

export function monthBounds(key: string): { start: Date; end: Date } {
  const start = monthStart(key);
  return { start, end: addMonths(start, 1) };
}

/** All month keys from `from` to `to` inclusive, oldest first. */
export function monthKeysBetween(from: Date, to: Date): string[] {
  if (from > to) return [];
  return eachMonthOfInterval({ start: from, end: to }).map((m) => monthKey(m));
}

export function deriveStyle(p: PositionForReport): TradeStyle {
  if (p.style) return p.style;
  const { firstFillAt, closedAt } = p.summary;
  return firstFillAt && closedAt && isSameDay(firstFillAt, closedAt) ? 'day' : 'swing';
}

/** Capital (net invested + realized P&L + adjustments) from everything strictly before `at`. */
export function capitalAt(
  at: Date,
  flows: readonly CapitalFlowInput[],
  positions: readonly PositionForReport[],
  adjustments: readonly AdjustmentInput[] = [],
): Decimal {
  const realized = sum(
    positions.flatMap((p) =>
      p.summary.realizations.filter((r) => r.at < at).map((r) => r.realizedPnl),
    ),
  );
  const adjusted = sum(
    adjustments.filter((a) => toDate(a.occurred_at) < at).map((a) => a.amount_usdt),
  );
  return netFlows(flows, at).plus(realized).plus(adjusted);
}

function toTradeStat(p: PositionForReport): TradeStat {
  return {
    positionId: p.id,
    symbol: p.symbol,
    realizedPnl: p.summary.realizedPnl,
    pnlPct: p.summary.pnlPct,
    style: deriveStyle(p),
    closedAt: p.summary.closedAt!,
  };
}

function pick<T>(items: T[], better: (a: T, b: T) => boolean): T | null {
  let best: T | null = null;
  for (const it of items) if (best === null || better(it, best)) best = it;
  return best;
}

export function buildMonthlyReport(
  key: string,
  flows: readonly CapitalFlowInput[],
  positions: readonly PositionForReport[],
  adjustments: readonly AdjustmentInput[] = [],
): MonthlyReport {
  const { start, end } = monthBounds(key);
  const inMonth = (t: Date) => t >= start && t < end;
  const spanMs = end.getTime() - start.getTime();

  // Realized P&L = sells (and dust write-offs) dated in this month.
  const events = positions.flatMap((p) =>
    p.summary.realizations.filter((r) => inMonth(r.at)).map((r) => ({ symbol: p.symbol, r })),
  );
  const realizedPnl = sum(events.map((e) => e.r.realizedPnl));
  const monthAdjustments = adjustments.filter((a) => inMonth(toDate(a.occurred_at)));
  const adjustmentsPnl = sum(monthAdjustments.map((a) => a.amount_usdt));
  const pnl = realizedPnl.plus(adjustmentsPnl);

  // Capital and flows.
  const monthFlows = flows.filter((f) => inMonth(toDate(f.occurred_at)));
  const deposits = sum(monthFlows.filter((f) => f.type === 'deposit').map((f) => f.amount_usdt));
  const withdrawals = sum(
    monthFlows.filter((f) => f.type === 'withdrawal').map((f) => f.amount_usdt),
  );
  const startCapital = capitalAt(start, flows, positions, adjustments);
  const endCapital = capitalAt(end, flows, positions, adjustments);

  const weightedFlows = sum(
    monthFlows.map((f) => {
      const weight = d(end.getTime() - toDate(f.occurred_at).getTime()).div(spanMs);
      const amount = f.type === 'deposit' ? d(f.amount_usdt) : d(f.amount_usdt).neg();
      return amount.times(weight);
    }),
  );
  const dietzBase = startCapital.plus(weightedFlows);

  // Trades closed this month.
  const closedTrades = positions
    .filter(
      (p) => p.summary.status === 'closed' && p.summary.closedAt && inMonth(p.summary.closedAt),
    )
    .map(toTradeStat);
  const winners = closedTrades.filter((t) => t.realizedPnl.gt(0));
  const losers = closedTrades.filter((t) => t.realizedPnl.lt(0));
  const grossWin = sum(winners.map((t) => t.realizedPnl));
  const grossLoss = sum(losers.map((t) => t.realizedPnl)); // negative
  const withPct = closedTrades.filter((t) => t.pnlPct !== null);

  // P&L by coin.
  const byCoin = new Map<string, Decimal>();
  for (const { symbol, r } of events) {
    byCoin.set(symbol, (byCoin.get(symbol) ?? ZERO).plus(r.realizedPnl));
  }
  const pnlByCoin = [...byCoin.entries()]
    .map(([symbol, pnl]) => ({ symbol, pnl }))
    .sort((a, b) => b.pnl.comparedTo(a.pnl));

  // Daily cumulative curve.
  const byDay = new Map<string, Decimal>();
  for (const { r } of events) {
    const k = format(r.at, 'yyyy-MM-dd');
    byDay.set(k, (byDay.get(k) ?? ZERO).plus(r.realizedPnl));
  }
  for (const a of monthAdjustments) {
    const k = format(toDate(a.occurred_at), 'yyyy-MM-dd');
    byDay.set(k, (byDay.get(k) ?? ZERO).plus(a.amount_usdt));
  }
  let running: Decimal = ZERO;
  const daily = eachDayOfInterval({ start, end: new Date(end.getTime() - 1) }).map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    const pnl = byDay.get(date) ?? ZERO;
    running = running.plus(pnl);
    return { date, pnl, cumulative: running };
  });

  const styleSplit: MonthlyReport['styleSplit'] = {
    day: { count: 0, pnl: ZERO },
    swing: { count: 0, pnl: ZERO },
  };
  for (const t of closedTrades) {
    styleSplit[t.style].count++;
    styleSplit[t.style].pnl = styleSplit[t.style].pnl.plus(t.realizedPnl);
  }

  const feesUsdt = sum(
    positions.flatMap((p) => p.summary.fees.filter((f) => inMonth(f.at)).map((f) => f.feeUsdt)),
  );

  return {
    month: key,
    start,
    end,
    realizedPnl,
    adjustmentsPnl,
    pnl,
    returnPct: dietzBase.gt(0) ? pnl.div(dietzBase) : null,
    simpleReturnPct: startCapital.gt(0) ? pnl.div(startCapital) : null,
    startCapital,
    endCapital,
    deposits,
    withdrawals,
    closedCount: closedTrades.length,
    wins: winners.length,
    losses: losers.length,
    winRate: safeDiv(winners.length, winners.length + losers.length),
    avgWin: safeDiv(grossWin, winners.length),
    avgLoss: safeDiv(grossLoss, losers.length),
    profitFactor: grossLoss.isZero() ? null : grossWin.div(grossLoss.abs()),
    bestByUsdt: pick(closedTrades, (a, b) => a.realizedPnl.gt(b.realizedPnl)),
    worstByUsdt: pick(closedTrades, (a, b) => a.realizedPnl.lt(b.realizedPnl)),
    bestByPct: pick(withPct, (a, b) => a.pnlPct!.gt(b.pnlPct!)),
    worstByPct: pick(withPct, (a, b) => a.pnlPct!.lt(b.pnlPct!)),
    closedTrades,
    feesUsdt,
    pnlByCoin,
    daily,
    styleSplit,
  };
}
