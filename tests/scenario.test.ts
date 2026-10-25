import { describe, expect, it } from 'vitest';
import { equitySeries } from '../src/lib/equity';
import { buildMonthlyReport, type PositionForReport } from '../src/lib/monthly';
import {
  computeAccount,
  computePosition,
  type CapitalFlowInput,
  type FillInput,
} from '../src/lib/pnl';
import { buildMonthSnapshot, holdingsAt } from '../src/lib/snapshot';
import { at, buy, s, sell } from './helpers';

// Three months of sample activity, numbers worked out by hand. This is the data path every
// screen uses (dashboard KPIs, equity curve, month list/detail, snapshots).

const flows: CapitalFlowInput[] = [
  { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 8, 1, 0) },
  { type: 'deposit', amount_usdt: 500, occurred_at: at(2026, 9, 16, 0) }, // half of September left
];

const fills: Record<string, { symbol: string; fills: FillInput[] }> = {
  btc: {
    symbol: 'BTC',
    fills: [
      buy('0.01', 60000, at(2026, 8, 5), { fee_amount: '0.6', fee_asset: 'USDT', fee_usdt: '0.6' }),
      sell('0.01', 63000, at(2026, 8, 20), {
        fee_amount: '0.63',
        fee_asset: 'USDT',
        fee_usdt: '0.63',
      }),
    ], // +28.77
  },
  sol: {
    symbol: 'SOL',
    fills: [
      buy(5, 100, at(2026, 9, 3)),
      sell(2, 120, at(2026, 9, 25)),
      sell(3, 90, at(2026, 10, 5)),
    ],
    // +40 in Sep, −30 in Oct, position closes in Oct at +10
  },
  eth: {
    symbol: 'ETH',
    fills: [buy('0.1', 2500, at(2026, 9, 10, 10)), sell('0.1', 2400, at(2026, 9, 10, 16))], // −10, day trade
  },
  ada: { symbol: 'ADA', fills: [buy(1000, '0.5', at(2026, 10, 10))] }, // open, cost 500
};

const live: Record<string, number> = { ada: 0.6 };

const positions: PositionForReport[] = Object.entries(fills).map(([id, p]) => ({
  id,
  symbol: p.symbol,
  summary: computePosition(p.fills, { symbol: p.symbol, livePrice: live[id] }),
}));

describe('three-month sample', () => {
  it('dashboard KPIs', () => {
    const a = computeAccount(
      flows,
      positions.map((p) => p.summary),
    );
    expect(s(a.netInvested)).toBe('1500');
    expect(s(a.realizedTotal)).toBe('28.77');
    expect(s(a.cashUsdt)).toBe('1028.77');
    expect(s(a.unrealizedPnl)).toBe('100');
    expect(s(a.portfolioValue)).toBe('1628.77');
    expect(s(a.totalReturn)).toBe('128.77');
  });

  it('August', () => {
    const r = buildMonthlyReport('2026-08', flows, positions);
    expect(s(r.realizedPnl)).toBe('28.77');
    expect(s(r.startCapital)).toBe('0');
    expect(s(r.endCapital)).toBe('1028.77');
    expect(s(r.returnPct)).toBe('0.02877'); // deposit present the whole month
    expect(r.simpleReturnPct).toBeNull();
    expect(s(r.feesUsdt)).toBe('1.23');
    expect([r.closedCount, r.wins, r.losses]).toEqual([1, 1, 0]);
  });

  it('September', () => {
    const r = buildMonthlyReport('2026-09', flows, positions);
    expect(s(r.realizedPnl)).toBe('30');
    expect(s(r.startCapital)).toBe('1028.77');
    expect(s(r.endCapital)).toBe('1558.77');
    expect(s(r.returnPct, 6)).toBe('0.02346'); // 30 / (1028.77 + 500 × 0.5)
    expect(s(r.simpleReturnPct, 6)).toBe('0.029161'); // 30 / 1028.77
    expect([r.closedCount, r.wins, r.losses]).toEqual([1, 0, 1]); // ETH; SOL still open
    expect(r.styleSplit.day).toMatchObject({ count: 1 });
    expect(r.pnlByCoin.map((c) => [c.symbol, s(c.pnl)])).toEqual([
      ['SOL', '40'],
      ['ETH', '-10'],
    ]);
  });

  it('October', () => {
    const r = buildMonthlyReport('2026-10', flows, positions);
    expect(s(r.realizedPnl)).toBe('-30');
    expect(s(r.startCapital)).toBe('1558.77');
    expect(s(r.endCapital)).toBe('1528.77');
    expect([r.closedCount, r.wins, r.losses]).toEqual([1, 1, 0]); // SOL closes at +10 overall
    expect(r.bestByUsdt?.positionId).toBe('sol');
  });

  it('September snapshot values the 3 SOL still held at month close', () => {
    const inputs = Object.entries(fills).map(([id, p]) => ({
      id,
      symbol: p.symbol,
      coingecko_id: id,
      closed_manually: false,
      closed_at: null,
      fills: p.fills,
    }));
    const holdings = holdingsAt(inputs, new Date(2026, 9, 1));
    expect(holdings.map((h) => [h.symbol, h.qty, h.openCost])).toEqual([['SOL', '3', '300']]);
    const snap = buildMonthSnapshot('2026-09', flows, positions, holdings, { sol: 95 });
    expect(snap.unrealized_pnl_at_close).toBe('-15');
    expect(snap.portfolio_value_at_close).toBe('1543.77');
  });

  it('equity curve', () => {
    const e = equitySeries(
      flows,
      positions.map((p) => p.summary),
    );
    expect(e.map((p) => [p.date, s(p.capital), s(p.flow)])).toEqual([
      ['2026-08-01', '1000', '1000'],
      ['2026-08-20', '1028.77', null],
      ['2026-09-10', '1018.77', null],
      ['2026-09-16', '1518.77', '500'],
      ['2026-09-25', '1558.77', null],
      ['2026-10-05', '1528.77', null],
    ]);
  });
});
