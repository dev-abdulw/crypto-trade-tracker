import { useMemo } from 'react';
import {
  combinedDailyRate,
  MEEZAN_OWNERS,
  ownerShares,
  summarizeHolding,
  type HoldingSummary,
  type MeezanFund,
  type OwnerShare,
} from '../lib/meezan';
import { sum, type Decimal } from '../lib/money';
import type { MeezanEntryRow } from '../lib/types';
import { useMeezanEntries } from './meezan';

/** One fund = one shared account, split between family members. */
export interface FundHolding {
  fund: MeezanFund;
  entries: MeezanEntryRow[];
  summary: HoldingSummary;
  shares: OwnerShare[];
}

export interface FundTotals {
  value: Decimal;
  invested: Decimal;
  profit: Decimal;
  tax: Decimal;
  netProfit: Decimal;
  avgDaily: Decimal | null;
  latestDaily: Decimal | null;
  /** Money added since the last balance update (whole family only). */
  addedSinceUpdate: Decimal | null;
}

export interface PersonTotals extends FundTotals {
  owner: string;
}

/** Family order (Mine, Junaid, Usama, Dad), then anyone else. */
function ownerOrder(a: string, b: string): number {
  const i = (id: string) => {
    const n = MEEZAN_OWNERS.findIndex((o) => o.id === id);
    return n === -1 ? MEEZAN_OWNERS.length : n;
  };
  return i(a) - i(b) || a.localeCompare(b);
}

/** Everything the Funds screens need, derived once from the stored entries. */
export function useFunds() {
  const entries = useMeezanEntries();

  const derived = useMemo(() => {
    const groups = new Map<MeezanFund, MeezanEntryRow[]>();
    for (const e of entries.data ?? []) groups.set(e.fund, [...(groups.get(e.fund) ?? []), e]);
    const holdings: FundHolding[] = [...groups].map(([fund, rows]) => ({
      fund,
      entries: rows,
      summary: summarizeHolding(rows),
      shares: ownerShares(rows),
    }));

    const byOwner = new Map<string, OwnerShare[]>();
    for (const h of holdings) {
      for (const sh of h.shares) byOwner.set(sh.owner, [...(byOwner.get(sh.owner) ?? []), sh]);
    }
    const people: PersonTotals[] = [...byOwner]
      .sort(([a], [b]) => ownerOrder(a, b))
      .map(([owner, shs]) => {
        const periods = shs.flatMap((x) => x.periods).filter((p) => p.capitalDays.gt(0));
        return {
          owner,
          invested: sum(shs.map((x) => x.invested)),
          value: sum(shs.map((x) => x.currentValue)),
          profit: sum(shs.map((x) => x.profit)),
          tax: sum(shs.map((x) => x.tax)),
          netProfit: sum(shs.map((x) => x.netProfit)),
          avgDaily: combinedDailyRate([periods]),
          latestDaily: periods[periods.length - 1]?.dailyRate ?? null,
          addedSinceUpdate: null,
        };
      });

    const ss = holdings.map((h) => h.summary);
    const withLatest = ss.filter((s) => s.latestDailyRate);
    const family: FundTotals = {
      value: sum(ss.map((s) => s.currentValue)),
      invested: sum(ss.map((s) => s.invested)),
      profit: sum(ss.map((s) => s.profit)),
      tax: sum(ss.map((s) => s.tax)),
      netProfit: sum(ss.map((s) => s.netProfit)),
      addedSinceUpdate: sum(ss.map((s) => s.addedSinceUpdate)),
      avgDaily: combinedDailyRate(ss.map((s) => s.periods)),
      // value-weighted latest rate across funds
      latestDaily: withLatest.length
        ? sum(withLatest.map((s) => s.latestDailyRate!.times(s.currentValue))).div(
            sum(withLatest.map((s) => s.currentValue)),
          )
        : null,
    };

    const updates = ss.flatMap((s) => (s.lastUpdate ? [s.lastUpdate.at.getTime()] : []));
    return {
      holdings,
      people,
      family,
      lastUpdate: updates.length ? new Date(Math.max(...updates)) : null,
    };
  }, [entries.data]);

  return {
    ...derived,
    /** Totals for 'all' (the family) or one person. */
    totalsFor: (owner: string): FundTotals =>
      derived.people.find((p) => p.owner === owner) ?? derived.family,
    isLoading: entries.isLoading,
    isEmpty: !!entries.data && entries.data.length === 0,
    error: entries.error,
    missingTable: !!entries.error && /meezan_entries/.test(entries.error.message),
  };
}
