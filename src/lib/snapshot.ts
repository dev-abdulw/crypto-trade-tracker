import { addMonths, format, isBefore, subMonths } from 'date-fns';
import {
  buildMonthlyReport,
  monthBounds,
  monthKey,
  monthStart,
  type PositionForReport,
} from './monthly';
import { sum, ZERO, d } from './money';
import { computePosition, toDate, type CapitalFlowInput, type FillInput } from './pnl';

// Month-end snapshots (PLAN.md 3.4): frozen holdings value for a finished month.

export interface SnapshotPositionInput {
  id: string;
  symbol: string;
  coingecko_id: string;
  closed_manually: boolean;
  closed_at: string | null;
  fills: readonly FillInput[];
}

export interface Holding {
  positionId: string;
  symbol: string;
  coingecko_id: string;
  qty: string;
  openCost: string;
}

/** Open holdings as they stood just before `at`, replaying only fills executed before it. */
export function holdingsAt(positions: readonly SnapshotPositionInput[], at: Date): Holding[] {
  const out: Holding[] = [];
  for (const p of positions) {
    const fills = p.fills.filter((f) => toDate(f.executed_at) < at);
    if (fills.length === 0) continue;
    const manualCloseAt =
      p.closed_manually && p.closed_at && toDate(p.closed_at) < at ? p.closed_at : null;
    try {
      const s = computePosition(fills, { symbol: p.symbol, manualCloseAt });
      if (s.status === 'open' && s.remainingQty.gt(0)) {
        out.push({
          positionId: p.id,
          symbol: p.symbol,
          coingecko_id: p.coingecko_id,
          qty: s.remainingQty.toFixed(),
          openCost: s.openCost.toFixed(),
        });
      }
    } catch {
      // inconsistent fills are surfaced on the position page; skip here
    }
  }
  return out;
}

export interface MonthSnapshotValues {
  month: string; // yyyy-MM-01
  start_capital: string;
  end_capital: string;
  realized_pnl: string;
  unrealized_pnl_at_close: string;
  portfolio_value_at_close: string;
}

/**
 * Snapshot numbers for month `key`. `prices` are month-end prices by coingecko_id; a holding
 * without a price is valued at cost (zero unrealized).
 */
export function buildMonthSnapshot(
  key: string,
  flows: readonly CapitalFlowInput[],
  reportPositions: readonly PositionForReport[],
  holdings: readonly Holding[],
  prices: Record<string, number | undefined>,
): MonthSnapshotValues {
  const report = buildMonthlyReport(key, flows, reportPositions);
  const unrealized = sum(
    holdings.map((h) => {
      const price = prices[h.coingecko_id];
      return price === undefined ? ZERO : d(h.qty).times(price).minus(h.openCost);
    }),
  );
  const dp = (v: ReturnType<typeof d>) => v.toDecimalPlaces(8).toFixed();
  return {
    month: format(report.start, 'yyyy-MM-dd'),
    start_capital: dp(report.startCapital),
    end_capital: dp(report.endCapital),
    realized_pnl: dp(report.realizedPnl),
    unrealized_pnl_at_close: dp(unrealized),
    // capital minus cost of what is held, plus its market value
    portfolio_value_at_close: dp(report.endCapital.plus(unrealized)),
  };
}

/**
 * Finished months (oldest first) from the first activity up to last month that have no
 * snapshot yet. Capped to the most recent `limit` months (historical prices go back ~1 year).
 */
export function monthsNeedingSnapshot(
  firstActivity: Date | null,
  now: Date,
  existing: ReadonlySet<string>,
  limit = 12,
): string[] {
  if (!firstActivity) return [];
  const thisMonth = monthStart(monthKey(now));
  const earliest = subMonths(thisMonth, limit);
  let cursor = monthStart(monthKey(firstActivity));
  if (isBefore(cursor, earliest)) cursor = earliest;
  const keys: string[] = [];
  while (isBefore(cursor, thisMonth)) {
    const key = monthKey(cursor);
    if (!existing.has(key)) keys.push(key);
    cursor = addMonths(cursor, 1);
  }
  return keys;
}

/** The instant whose CoinGecko daily price stands for the close of month `key`. */
export function monthClosePriceDate(key: string): Date {
  const { end } = monthBounds(key);
  return new Date(Date.UTC(end.getFullYear(), end.getMonth(), 1));
}
