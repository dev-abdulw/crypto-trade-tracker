import { describe, expect, it } from 'vitest';
import {
  afterTax,
  combinedDailyRate,
  project,
  ratesFromDaily,
  summarizeHolding,
  type MeezanEntryInput,
} from '../src/lib/meezan';
import { at, s } from './helpers';

// Same shape as a real start: first deposit, a top-up on the day of a balance check, a one-day
// update, then more money added after that update.
const entries: MeezanEntryInput[] = [
  { kind: 'deposit', amount_pkr: 1_000_000, occurred_at: at(2026, 10, 1, 10) },
  { kind: 'deposit', amount_pkr: 1_000_000, occurred_at: at(2026, 10, 12, 10) },
  { kind: 'valuation', amount_pkr: 2_003_300, occurred_at: at(2026, 10, 12, 11) },
  { kind: 'valuation', amount_pkr: 2_003_900, occurred_at: at(2026, 10, 13, 9) },
  { kind: 'deposit', amount_pkr: 500_000, occurred_at: at(2026, 10, 13, 12) },
];

describe('summarizeHolding', () => {
  const h = summarizeHolding(entries);

  it('splits profit into periods between balance updates', () => {
    expect(h.periods.map((p) => [s(p.profit), s(p.capitalDays), p.days])).toEqual([
      ['3300', '11000000', 11], // 1M earned for 11 days; the same-day top-up earned nothing yet
      ['600', '2003300', 1],
    ]);
    expect(s(h.periods[0]!.dailyRate)).toBe('0.0003');
  });

  it('values the holding and its after-tax profit', () => {
    expect(s(h.invested)).toBe('2500000');
    expect(s(h.addedSinceUpdate)).toBe('500000');
    expect(s(h.currentValue)).toBe('2503900');
    expect(s(h.profit)).toBe('3900');
    expect(s(h.tax)).toBe('585');
    expect(s(h.netProfit)).toBe('3315');
    expect(s(h.netValue)).toBe('2503315');
  });

  it('averages the rate over all rupee-days and keeps the latest separately', () => {
    expect(s(h.avgDailyRate, 12)).toBe(s(combinedDailyRate([h.periods]), 12));
    expect(s(h.avgDailyRate, 10)).toBe('0.0002999239');
    expect(s(h.latestDailyRate, 10)).toBe('0.0002995058');
  });

  it('is empty-safe', () => {
    const e = summarizeHolding([]);
    expect(s(e.currentValue)).toBe('0');
    expect(e.avgDailyRate).toBeNull();
  });

  it('counts a withdrawal as money out, not loss', () => {
    const w = summarizeHolding([
      { kind: 'deposit', amount_pkr: 100_000, occurred_at: at(2026, 10, 1) },
      { kind: 'withdrawal', amount_pkr: 50_000, occurred_at: at(2026, 10, 11) },
      { kind: 'valuation', amount_pkr: 50_400, occurred_at: at(2026, 10, 11, 18) },
    ]);
    expect(s(w.profit)).toBe('400');
    expect(s(w.periods[0]!.capitalDays)).toBe('1000000'); // 100k × 10 days; withdrawal same day
  });
});

describe('rates and tax', () => {
  it('compounds a daily rate into month and year', () => {
    const r = ratesFromDaily('0.0003');
    expect(s(r.monthly, 6)).toBe('0.009165');
    expect(s(r.yearly, 6)).toBe('0.115702');
  });
  it('takes 15% off profit only', () => {
    expect(s(afterTax(1000))).toBe('850');
    expect(s(afterTax(-100))).toBe('-100');
  });
});

describe('project', () => {
  it('reinvesting only', () => {
    const [y1] = project({ start: 100_000, monthlySip: 0, years: 1, monthlyRate: '0.01' });
    expect(s(y1!.value, 2)).toBe('112682.5');
    expect(s(y1!.tax, 4)).toBe('1902.3755');
    expect(s(y1!.netValue, 2)).toBe('110780.13');
  });

  it('with a monthly SIP added at the start of each month', () => {
    const rows = project({ start: 100_000, monthlySip: 10_000, years: 10, monthlyRate: '0.01' });
    expect(rows).toHaveLength(10);
    expect(s(rows[0]!.contributed)).toBe('220000');
    expect(s(rows[0]!.value, 2)).toBe('240775.78');
    expect(s(rows[9]!.contributed)).toBe('1300000');
  });
});
