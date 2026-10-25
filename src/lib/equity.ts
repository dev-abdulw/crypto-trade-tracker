import { format } from 'date-fns';
import { d, ZERO, type Decimal } from './money';
import { toDate, type AdjustmentInput, type CapitalFlowInput, type PositionSummary } from './pnl';

// Equity curve: capital (net invested + realized P&L) over time, one point per active day.

export interface EquityPoint {
  date: string; // yyyy-MM-dd (local)
  /** End-of-day capital. */
  capital: Decimal;
  netInvested: Decimal;
  /** Net deposit (+) / withdrawal (−) that day, so the chart can mark it; null if none. */
  flow: Decimal | null;
  realized: Decimal;
}

export function equitySeries(
  flows: readonly CapitalFlowInput[],
  positions: readonly PositionSummary[],
  adjustments: readonly AdjustmentInput[] = [],
): EquityPoint[] {
  type Event = { at: Date; isFlow: boolean; flow: Decimal; pnl: Decimal };
  const events: Event[] = [
    ...flows.map((f) => ({
      at: toDate(f.occurred_at),
      isFlow: true,
      flow: f.type === 'deposit' ? d(f.amount_usdt) : d(f.amount_usdt).neg(),
      pnl: ZERO,
    })),
    ...positions.flatMap((p) =>
      p.realizations.map((r) => ({ at: r.at, isFlow: false, flow: ZERO, pnl: r.realizedPnl })),
    ),
    ...adjustments.map((a) => ({
      at: toDate(a.occurred_at),
      isFlow: false,
      flow: ZERO,
      pnl: d(a.amount_usdt),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime() || Number(b.isFlow) - Number(a.isFlow));

  const points: EquityPoint[] = [];
  let invested: Decimal = ZERO;
  let realizedTotal: Decimal = ZERO;
  for (const e of events) {
    invested = invested.plus(e.flow);
    realizedTotal = realizedTotal.plus(e.pnl);
    const date = format(e.at, 'yyyy-MM-dd');
    const last = points[points.length - 1];
    const today = last?.date === date ? last : null;
    const flow = e.isFlow || today?.flow ? (today?.flow ?? ZERO).plus(e.flow) : null;
    const point: EquityPoint = {
      date,
      capital: invested.plus(realizedTotal),
      netInvested: invested,
      realized: (today?.realized ?? ZERO).plus(e.pnl),
      flow,
    };
    if (today) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}
