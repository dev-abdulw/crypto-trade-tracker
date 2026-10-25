import { describe, expect, it } from 'vitest';
import type { PositionForReport } from '../src/lib/monthly';
import { computePosition, type CapitalFlowInput, type FillInput } from '../src/lib/pnl';
import {
  buildMonthSnapshot,
  holdingsAt,
  monthClosePriceDate,
  monthsNeedingSnapshot,
  type SnapshotPositionInput,
} from '../src/lib/snapshot';
import { at, buy, sell } from './helpers';

function input(id: string, symbol: string, fills: FillInput[]): SnapshotPositionInput {
  return {
    id,
    symbol,
    coingecko_id: symbol.toLowerCase(),
    closed_manually: false,
    closed_at: null,
    fills,
  };
}

describe('holdingsAt', () => {
  const sol = input('sol', 'SOL', [
    buy(2, 100, at(2026, 9, 10)),
    sell(1, 120, at(2026, 9, 20)),
    sell(1, 130, at(2026, 10, 5)), // after September → still held at Sept close
  ]);
  const eth = input('eth', 'ETH', [buy(1, 2000, at(2026, 10, 2))]); // opened in October

  it('replays only fills before the instant', () => {
    const h = holdingsAt([sol, eth], new Date(2026, 9, 1));
    expect(h).toEqual([
      { positionId: 'sol', symbol: 'SOL', coingecko_id: 'sol', qty: '1', openCost: '100' },
    ]);
  });

  it('ignores a manual close that happened later', () => {
    const closedLater = { ...sol, closed_manually: true, closed_at: at(2026, 10, 3).toISOString() };
    expect(holdingsAt([closedLater], new Date(2026, 9, 1))).toHaveLength(1);
    expect(holdingsAt([closedLater], new Date(2026, 10, 1))).toHaveLength(0);
  });
});

describe('buildMonthSnapshot', () => {
  it('freezes realized, capital and unrealized at month end', () => {
    const flows: CapitalFlowInput[] = [
      { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 9, 1) },
    ];
    const fills = [buy(2, 100, at(2026, 9, 10)), sell(1, 120, at(2026, 9, 20))];
    const report: PositionForReport[] = [
      { id: 'sol', symbol: 'SOL', summary: computePosition(fills, { symbol: 'SOL' }) },
    ];
    const holdings = holdingsAt([input('sol', 'SOL', fills)], new Date(2026, 9, 1));
    const snap = buildMonthSnapshot('2026-09', flows, report, holdings, { sol: 150 });
    expect(snap).toEqual({
      month: '2026-09-01',
      start_capital: '0',
      end_capital: '1020',
      realized_pnl: '20',
      unrealized_pnl_at_close: '50',
      portfolio_value_at_close: '1070',
    });
  });

  it('values a holding without a price at cost', () => {
    const fills = [buy(1, 100, at(2026, 9, 10))];
    const holdings = holdingsAt([input('x', 'X', fills)], new Date(2026, 9, 1));
    const snap = buildMonthSnapshot('2026-09', [], [], holdings, {});
    expect(snap.unrealized_pnl_at_close).toBe('0');
  });
});

describe('monthsNeedingSnapshot', () => {
  const now = at(2026, 10, 25);
  it('lists finished months since first activity that lack a snapshot', () => {
    expect(monthsNeedingSnapshot(at(2026, 7, 15), now, new Set(['2026-08']))).toEqual([
      '2026-07',
      '2026-09',
    ]);
  });
  it('never includes the current month', () => {
    expect(monthsNeedingSnapshot(at(2026, 10, 2), now, new Set())).toEqual([]);
  });
  it('caps to the most recent months', () => {
    const keys = monthsNeedingSnapshot(at(2020, 1, 1), now, new Set(), 3);
    expect(keys).toEqual(['2026-07', '2026-08', '2026-09']);
  });
  it('is empty without activity', () => {
    expect(monthsNeedingSnapshot(null, now, new Set())).toEqual([]);
  });
});

describe('monthClosePriceDate', () => {
  it('is 00:00 UTC on the first day of the next month', () => {
    expect(monthClosePriceDate('2026-09').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(monthClosePriceDate('2026-12').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});
