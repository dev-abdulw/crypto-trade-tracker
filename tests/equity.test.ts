import { describe, expect, it } from 'vitest';
import { equitySeries } from '../src/lib/equity';
import { computePosition, type CapitalFlowInput } from '../src/lib/pnl';
import { at, buy, s, sell } from './helpers';

describe('equitySeries', () => {
  const flows: CapitalFlowInput[] = [
    { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 3, 1, 9) },
    { type: 'deposit', amount_usdt: 500, occurred_at: at(2026, 3, 10, 9) },
    { type: 'withdrawal', amount_usdt: 200, occurred_at: at(2026, 3, 10, 18) },
  ];
  const p = computePosition(
    [buy(2, 100, at(2026, 3, 2)), sell(1, 120, at(2026, 3, 5)), sell(1, 90, at(2026, 3, 10, 12))],
    { symbol: 'SOL' },
  );
  const series = equitySeries(flows, [p]);

  it('emits one point per active day with end-of-day capital', () => {
    expect(series.map((x) => x.date)).toEqual(['2026-03-01', '2026-03-05', '2026-03-10']);
    expect(series.map((x) => s(x.capital))).toEqual(['1000', '1020', '1310']);
    expect(series.map((x) => s(x.netInvested))).toEqual(['1000', '1000', '1300']);
  });

  it('marks deposits/withdrawals separately from profit', () => {
    expect(series.map((x) => s(x.flow))).toEqual(['1000', null, '300']);
    expect(series.map((x) => s(x.realized))).toEqual(['0', '20', '-10']);
  });

  it('is empty with no activity', () => {
    expect(equitySeries([], [])).toEqual([]);
  });
});
