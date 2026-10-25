import { describe, expect, it } from 'vitest';
import { canMerge, planMerge, type MergeablePosition } from '../src/lib/merge';
import { computePosition } from '../src/lib/pnl';
import { at, buy, s, sell } from './helpers';

const base: MergeablePosition = {
  id: 'a',
  symbol: 'SOL',
  coingecko_id: 'solana',
  status: 'open',
  opened_at: at(2026, 10, 1).toISOString(),
  style: null,
  setup: null,
  target_price: null,
  stop_price: null,
  notes: null,
};

describe('planMerge', () => {
  it('keeps the older position', () => {
    const newer = { ...base, id: 'b', opened_at: at(2026, 10, 3).toISOString() };
    expect(planMerge(newer, base)).toMatchObject({ keepId: 'a', removeId: 'b' });
    expect(planMerge(base, newer)).toMatchObject({ keepId: 'a', removeId: 'b' });
  });

  it('fills missing plan fields from the other and joins notes', () => {
    const a = { ...base, target_price: '200', notes: 'first idea' };
    const b = {
      ...base,
      id: 'b',
      opened_at: at(2026, 10, 2).toISOString(),
      target_price: '250',
      stop_price: '90',
      setup: 'dip-buy',
      notes: 'added on dip',
    };
    expect(planMerge(a, b).patch).toEqual({
      stop_price: '90',
      setup: 'dip-buy',
      notes: 'first idea\n\nadded on dip',
    });
  });

  it('changes nothing when the other has nothing to add', () => {
    const b = { ...base, id: 'b', opened_at: at(2026, 10, 2).toISOString() };
    expect(planMerge(base, b).patch).toEqual({});
  });

  it('refuses different coins, closed positions or the same position', () => {
    expect(canMerge(base, { ...base, id: 'b', coingecko_id: 'zcash' })).toBe(false);
    expect(canMerge(base, { ...base, id: 'b', status: 'closed' })).toBe(false);
    expect(canMerge(base, base)).toBe(false);
    expect(() => planMerge(base, { ...base, id: 'b', status: 'closed' })).toThrow();
  });
});

describe('merged position numbers', () => {
  it('a $500 and a $20 SOL buy become one position with a blended average entry', () => {
    const merged = computePosition(
      [buy(5, 100, at(2026, 10, 1)), buy('0.25', 80, at(2026, 10, 1, 12, 5))],
      { symbol: 'SOL', livePrice: 110 },
    );
    expect(s(merged.remainingQty)).toBe('5.25');
    expect(s(merged.openCost)).toBe('520');
    expect(s(merged.avgEntry, 8)).toBe('99.04761905');
    expect(s(merged.unrealizedPnl)).toBe('57.5');
  });

  it('keeps realized P&L from sells made before the merge', () => {
    const merged = computePosition(
      [buy(2, 100, at(2026, 10, 1)), sell(1, 120, at(2026, 10, 2)), buy(1, 90, at(2026, 10, 3))],
      { symbol: 'SOL' },
    );
    expect(s(merged.realizedPnl)).toBe('20');
    expect(s(merged.remainingQty)).toBe('2');
  });
});
