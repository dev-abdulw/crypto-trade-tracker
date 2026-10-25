import { describe, expect, it } from 'vitest';
import { adjustmentFor, adjustmentPct } from '../src/lib/adjustments';
import { equitySeries } from '../src/lib/equity';
import { buildMonthlyReport, type PositionForReport } from '../src/lib/monthly';
import {
  computeAccount,
  computePosition,
  type AdjustmentInput,
  type CapitalFlowInput,
} from '../src/lib/pnl';
import { at, buy, s, sell } from './helpers';

describe('adjustmentFor', () => {
  it('1000 → 1001 is +1 (+0.1%)', () => {
    const a = adjustmentFor('1001', '1000');
    expect(s(a.amount)).toBe('1');
    expect(s(a.pct)).toBe('0.001');
  });
  it('a lower real balance is a loss', () => {
    const a = adjustmentFor('987.5', '1000');
    expect(s(a.amount)).toBe('-12.5');
    expect(s(a.pct)).toBe('-0.0125');
  });
  it('no % without a positive starting value', () => {
    expect(adjustmentFor(50, 0).pct).toBeNull();
    expect(adjustmentPct(5, null)).toBeNull();
    expect(s(adjustmentPct(-2, 400))).toBe('-0.005');
  });
});

describe('adjustments in account, monthly and equity numbers', () => {
  const flows: CapitalFlowInput[] = [
    { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 6, 1, 0) },
  ];
  const positions: PositionForReport[] = [
    {
      id: 'p',
      symbol: 'SOL',
      summary: computePosition([buy(1, 100, at(2026, 6, 2)), sell(1, 110, at(2026, 6, 3))], {
        symbol: 'SOL',
      }),
    },
  ];
  const adjustments: AdjustmentInput[] = [
    { amount_usdt: '-4', occurred_at: at(2026, 6, 20) }, // fees the app missed
    { amount_usdt: '1', occurred_at: at(2026, 7, 2) },
  ];

  it('count as P&L, not as invested money', () => {
    const a = computeAccount(
      flows,
      positions.map((p) => p.summary),
      adjustments,
    );
    expect(s(a.netInvested)).toBe('1000');
    expect(s(a.realizedTotal)).toBe('10');
    expect(s(a.adjustmentsTotal)).toBe('-3');
    expect(s(a.cashUsdt)).toBe('1007');
    expect(s(a.portfolioValue)).toBe('1007');
    expect(s(a.totalReturn)).toBe('7');
  });

  it('land in the month they were made', () => {
    const june = buildMonthlyReport('2026-06', flows, positions, adjustments);
    expect(s(june.realizedPnl)).toBe('10');
    expect(s(june.adjustmentsPnl)).toBe('-4');
    expect(s(june.pnl)).toBe('6');
    expect(s(june.returnPct)).toBe('0.006');
    expect(s(june.endCapital)).toBe('1006');
    expect(s(june.daily.at(-1)!.cumulative)).toBe('6');

    const july = buildMonthlyReport('2026-07', flows, positions, adjustments);
    expect(s(july.startCapital)).toBe('1006');
    expect(s(july.pnl)).toBe('1');
  });

  it('move the equity curve without a deposit marker', () => {
    const e = equitySeries(
      flows,
      positions.map((p) => p.summary),
      adjustments,
    );
    expect(e.map((p) => [p.date, s(p.capital), s(p.flow)])).toEqual([
      ['2026-06-01', '1000', '1000'],
      ['2026-06-03', '1010', null],
      ['2026-06-20', '1006', null],
      ['2026-07-02', '1007', null],
    ]);
  });
});
