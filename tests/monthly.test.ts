import { describe, expect, it } from 'vitest';
import {
  buildMonthlyReport,
  monthBounds,
  monthKey,
  monthKeysBetween,
  type PositionForReport,
} from '../src/lib/monthly';
import { computePosition, type CapitalFlowInput, type FillInput } from '../src/lib/pnl';
import { at, buy, s, sell } from './helpers';

function pos(id: string, symbol: string, fills: FillInput[]): PositionForReport {
  return { id, symbol, summary: computePosition(fills, { symbol }) };
}

describe('month helpers', () => {
  it('keys and bounds use local time', () => {
    expect(monthKey(at(2026, 10, 31, 23, 59))).toBe('2026-10');
    const { start, end } = monthBounds('2026-10');
    expect(start).toEqual(new Date(2026, 9, 1));
    expect(end).toEqual(new Date(2026, 10, 1));
    expect(monthKeysBetween(at(2026, 8, 15), at(2026, 10, 2))).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
  });
});

describe('3. partial sells across months land in the right month', () => {
  const p = pos('p1', 'SOL', [
    buy(3, 100, at(2026, 3, 10), { fee_usdt: '0.3', fee_asset: 'USDT', fee_amount: '0.3' }),
    sell(1, 110, at(2026, 3, 20)),
    sell(1, 120, at(2026, 4, 2), { fee_usdt: '0.12', fee_asset: 'USDT', fee_amount: '0.12' }),
    sell(1, 90, at(2026, 4, 15)),
  ]);
  const flows: CapitalFlowInput[] = [
    { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 3, 1) },
  ];

  it('splits realized P&L by sell month', () => {
    const march = buildMonthlyReport('2026-03', flows, [p]);
    const april = buildMonthlyReport('2026-04', flows, [p]);
    // avg entry 100.1; sells: 9.9, 19.78, -10.1
    expect(s(march.realizedPnl)).toBe('9.9');
    expect(s(april.realizedPnl)).toBe('9.68');
    expect(march.closedCount).toBe(0);
    expect(april.closedCount).toBe(1);
    expect(s(march.feesUsdt)).toBe('0.3');
    expect(s(april.feesUsdt)).toBe('0.12');
    expect(s(april.startCapital)).toBe('1009.9');
    expect(s(april.endCapital)).toBe('1019.58');
  });
});

describe('9. monthly return with a mid-month deposit (Modified Dietz)', () => {
  const flows: CapitalFlowInput[] = [
    { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 2, 10) },
    // June has 30 days; June 16 00:00 is exactly half-way → weight 0.5
    { type: 'deposit', amount_usdt: 500, occurred_at: at(2026, 6, 16, 0) },
  ];
  const p = pos('p1', 'ETH', [buy(10, 100, at(2026, 6, 2)), sell(10, 115, at(2026, 6, 20))]);

  it('weights the deposit by the fraction of the month it was present', () => {
    const r = buildMonthlyReport('2026-06', flows, [p]);
    expect(s(r.realizedPnl)).toBe('150');
    expect(s(r.startCapital)).toBe('1000');
    expect(s(r.endCapital)).toBe('1650');
    expect(s(r.deposits)).toBe('500');
    expect(s(r.withdrawals)).toBe('0');
    expect(s(r.returnPct)).toBe('0.12'); // 150 / (1000 + 500 × 0.5)
    expect(s(r.simpleReturnPct)).toBe('0.15'); // 150 / 1000
  });

  it('a withdrawal reduces the base', () => {
    const r = buildMonthlyReport(
      '2026-06',
      [
        ...flows.slice(0, 1),
        { type: 'withdrawal', amount_usdt: 500, occurred_at: at(2026, 6, 16, 0) },
      ],
      [p],
    );
    expect(s(r.returnPct, 8)).toBe('0.2'); // 150 / (1000 − 250)
  });

  it('returns null percentages when there is no capital', () => {
    const r = buildMonthlyReport('2026-06', [], []);
    expect(r.returnPct).toBeNull();
    expect(r.simpleReturnPct).toBeNull();
  });
});

describe('10. win rate, profit factor, best / worst', () => {
  const positions = [
    pos('btc1', 'BTC', [buy(1, 1000, at(2026, 4, 1)), sell(1, 1100, at(2026, 4, 5))]), // +100, 10%
    pos('eth1', 'ETH', [buy(1, 200, at(2026, 4, 3, 10)), sell(1, 250, at(2026, 4, 3, 15))]), // +50, 25%, day
    pos('sol1', 'SOL', [buy(3, 100, at(2026, 4, 6)), sell(3, 90, at(2026, 4, 10))]), // −30, −10%
    pos('btc2', 'BTC', [buy(1, 100, at(2026, 4, 12)), sell(1, 80, at(2026, 4, 20))]), // −20, −20%
    pos('open', 'ADA', [buy(100, 1, at(2026, 4, 25))]), // still open — not counted
  ];
  const r = buildMonthlyReport('2026-04', [], positions);

  it('counts wins, losses and ratios', () => {
    expect(r.closedCount).toBe(4);
    expect(r.wins).toBe(2);
    expect(r.losses).toBe(2);
    expect(s(r.winRate)).toBe('0.5');
    expect(s(r.avgWin)).toBe('75');
    expect(s(r.avgLoss)).toBe('-25');
    expect(s(r.profitFactor)).toBe('3');
    expect(s(r.realizedPnl)).toBe('100');
  });

  it('finds best and worst trades by USDT and by %', () => {
    expect(r.bestByUsdt?.positionId).toBe('btc1');
    expect(r.worstByUsdt?.positionId).toBe('sol1');
    expect(r.bestByPct?.positionId).toBe('eth1');
    expect(r.worstByPct?.positionId).toBe('btc2');
  });

  it('groups P&L by coin and by day/swing', () => {
    expect(r.pnlByCoin.map((c) => [c.symbol, s(c.pnl)])).toEqual([
      ['BTC', '80'],
      ['ETH', '50'],
      ['SOL', '-30'],
    ]);
    expect(r.styleSplit.day.count).toBe(1);
    expect(s(r.styleSplit.day.pnl)).toBe('50');
    expect(r.styleSplit.swing.count).toBe(3);
    expect(s(r.styleSplit.swing.pnl)).toBe('50');
  });

  it('builds a daily cumulative curve for every day of the month', () => {
    expect(r.daily).toHaveLength(30);
    expect(r.daily[0]!.date).toBe('2026-04-01');
    const apr5 = r.daily.find((x) => x.date === '2026-04-05')!;
    expect(s(apr5.cumulative)).toBe('150');
    expect(s(r.daily[29]!.cumulative)).toBe('100');
  });

  it('profit factor is null when there are no losses', () => {
    const onlyWins = buildMonthlyReport('2026-04', [], positions.slice(0, 2));
    expect(onlyWins.profitFactor).toBeNull();
    expect(s(onlyWins.winRate)).toBe('1');
  });
});
