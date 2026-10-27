import { d, safeDiv, sum, ZERO, type Decimal, type Value } from './money';
import { toDate } from './pnl';

// Al Meezan fund maths (PKR). Each fund is one shared account: money in/out is tagged with the
// family member it belongs to, balance updates are for the whole account. Money added on day D
// earns its first profit on D+1. Between two balance updates, profit = balance change − money
// added; the daily rate is that profit over the rupee-days the money was earning, and the profit
// is shared between people in proportion to their rupee-days.

export const MEEZAN_FUNDS = ['AMMF', 'MIACF'] as const;
export type MeezanFund = (typeof MEEZAN_FUNDS)[number];

export const MEEZAN_OWNERS = [
  { id: 'me', label: 'Mine' },
  { id: 'junaid', label: "Junaid's" },
  { id: 'usama', label: "Usama's" },
  { id: 'dad', label: "Dad's" },
] as const;

/** `owner` stored on balance updates, which belong to the whole shared account. */
export const SHARED_OWNER = 'shared';

export function ownerLabel(id: string): string {
  return MEEZAN_OWNERS.find((o) => o.id === id)?.label ?? id;
}

/** Tax on profit. */
export const MEEZAN_TAX_RATE = d('0.15');

const DAYS_PER_YEAR = 365;

export type MeezanKind = 'deposit' | 'withdrawal' | 'valuation';

export interface MeezanEntryInput {
  kind: MeezanKind;
  amount_pkr: Value;
  occurred_at: string | Date;
  /** Who the money belongs to (deposits/withdrawals); ignored on balance updates. */
  owner?: string;
}

/** Calendar day number in the browser's time zone (so "same day" means the user's day). */
export function dayNumber(at: string | Date): number {
  const t = toDate(at);
  return Math.round(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) / 86_400_000);
}

export interface MeezanPeriod {
  from: Date | null;
  to: Date;
  days: number;
  /** Profit earned in the period (balance change minus net money added). */
  profit: Decimal;
  /** Σ rupees × days earning in the period. */
  capitalDays: Decimal;
  dailyRate: Decimal | null;
}

export interface HoldingSummary {
  deposits: Decimal;
  withdrawals: Decimal;
  /** deposits − withdrawals */
  invested: Decimal;
  lastUpdate: { at: Date; value: Decimal } | null;
  /** Net money added after the last balance update (not yet reflected in a reported profit). */
  addedSinceUpdate: Decimal;
  /** Last reported balance + money added since. */
  currentValue: Decimal;
  /** Gross profit since the start. */
  profit: Decimal;
  tax: Decimal;
  netProfit: Decimal;
  netValue: Decimal;
  periods: MeezanPeriod[];
  /** Σ profit / Σ rupee-days over every period with money earning. */
  avgDailyRate: Decimal | null;
  latestDailyRate: Decimal | null;
  firstAt: Date | null;
}

const KIND_ORDER: Record<MeezanKind, number> = { deposit: 0, withdrawal: 1, valuation: 2 };

export function summarizeHolding(entries: readonly MeezanEntryInput[]): HoldingSummary {
  const sorted = [...entries].sort(
    (a, b) =>
      toDate(a.occurred_at).getTime() - toDate(b.occurred_at).getTime() ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );

  let deposits: Decimal = ZERO;
  let withdrawals: Decimal = ZERO;
  let last: { at: Date; day: number; value: Decimal } | null = null;
  let pending: { amount: Decimal; day: number }[] = [];
  const periods: MeezanPeriod[] = [];

  for (const e of sorted) {
    const at = toDate(e.occurred_at);
    const day = dayNumber(at);
    const amount = d(e.amount_pkr);
    if (e.kind === 'deposit') {
      deposits = deposits.plus(amount);
      pending.push({ amount, day });
      continue;
    }
    if (e.kind === 'withdrawal') {
      withdrawals = withdrawals.plus(amount);
      pending.push({ amount: amount.neg(), day });
      continue;
    }
    // Balance update.
    const startValue = last?.value ?? ZERO;
    const startDay = last?.day ?? day;
    const added = sum(pending.map((p) => p.amount));
    const capitalDays = startValue
      .times(Math.max(0, day - startDay))
      .plus(sum(pending.map((p) => p.amount.times(Math.max(0, day - p.day)))));
    const profit = amount.minus(startValue).minus(added);
    periods.push({
      from: last?.at ?? null,
      to: at,
      days: Math.max(0, day - (last?.day ?? Math.min(day, ...pending.map((p) => p.day)))),
      profit,
      capitalDays,
      dailyRate: capitalDays.gt(0) ? profit.div(capitalDays) : null,
    });
    last = { at, day, value: amount };
    pending = [];
  }

  const invested = deposits.minus(withdrawals);
  const addedSinceUpdate = sum(pending.map((p) => p.amount));
  const currentValue = (last?.value ?? ZERO).plus(addedSinceUpdate);
  const profit = currentValue.minus(invested);
  const tax = profit.gt(0) ? profit.times(MEEZAN_TAX_RATE) : ZERO;
  const earning = periods.filter((p) => p.capitalDays.gt(0));
  const latest = earning[earning.length - 1];
  const first = sorted[0];

  return {
    deposits,
    withdrawals,
    invested,
    lastUpdate: last ? { at: last.at, value: last.value } : null,
    addedSinceUpdate,
    currentValue,
    profit,
    tax,
    netProfit: profit.minus(tax),
    netValue: currentValue.minus(tax),
    periods,
    avgDailyRate: combinedDailyRate([periods]),
    latestDailyRate: latest?.dailyRate ?? null,
    firstAt: first ? toDate(first.occurred_at) : null,
  };
}

export interface OwnerShare {
  owner: string;
  deposits: Decimal;
  withdrawals: Decimal;
  invested: Decimal;
  /** Share of the account at the last balance update + money added since. */
  currentValue: Decimal;
  profit: Decimal;
  tax: Decimal;
  netProfit: Decimal;
  netValue: Decimal;
  /** This person's profit and rupee-days per period (for their own rate). */
  periods: MeezanPeriod[];
  avgDailyRate: Decimal | null;
}

/**
 * Splits a shared account between family members. Each period's profit goes to people in
 * proportion to their rupee-days (balance share × days + money added × days earning).
 */
export function ownerShares(entries: readonly MeezanEntryInput[]): OwnerShare[] {
  const sorted = [...entries].sort(
    (a, b) =>
      toDate(a.occurred_at).getTime() - toDate(b.occurred_at).getTime() ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
  type State = {
    value: Decimal; // share at last balance update
    pending: { amount: Decimal; day: number }[];
    deposits: Decimal;
    withdrawals: Decimal;
    periods: MeezanPeriod[];
  };
  const people = new Map<string, State>();
  const person = (owner: string) => {
    let st = people.get(owner);
    if (!st) {
      st = { value: ZERO, pending: [], deposits: ZERO, withdrawals: ZERO, periods: [] };
      people.set(owner, st);
    }
    return st;
  };
  let last: { at: Date; day: number } | null = null;

  for (const e of sorted) {
    const at = toDate(e.occurred_at);
    const day = dayNumber(at);
    const amount = d(e.amount_pkr);
    if (e.kind !== 'valuation') {
      const st = person(e.owner ?? SHARED_OWNER);
      if (e.kind === 'deposit') st.deposits = st.deposits.plus(amount);
      else st.withdrawals = st.withdrawals.plus(amount);
      st.pending.push({ amount: e.kind === 'deposit' ? amount : amount.neg(), day });
      continue;
    }

    const lastDay = last?.day ?? day;
    const rows = [...people.values()].map((st) => {
      const added = sum(st.pending.map((p) => p.amount));
      const capitalDays = st.value
        .times(Math.max(0, day - lastDay))
        .plus(sum(st.pending.map((p) => p.amount.times(Math.max(0, day - p.day)))));
      return { st, added, capitalDays, before: st.value.plus(added) };
    });
    const profit = amount.minus(sum(rows.map((r) => r.before)));
    const totalCd = sum(rows.map((r) => r.capitalDays));
    const totalBefore = sum(rows.map((r) => r.before));
    // Weights: rupee-days; if nothing was earning yet (same-day update), current amounts.
    const weights = rows.map((r) => (totalCd.gt(0) ? r.capitalDays : r.before));
    const totalWeight = totalCd.gt(0) ? totalCd : totalBefore;

    let given: Decimal = ZERO;
    rows.forEach((r, i) => {
      // The last person takes the rounding remainder so shares always add up to the balance.
      const share =
        i === rows.length - 1
          ? profit.minus(given)
          : totalWeight.gt(0)
            ? profit.times(weights[i]!).div(totalWeight)
            : ZERO;
      given = given.plus(share);
      r.st.periods.push({
        from: last?.at ?? null,
        to: at,
        days: Math.max(0, day - lastDay),
        profit: share,
        capitalDays: r.capitalDays,
        dailyRate: r.capitalDays.gt(0) ? share.div(r.capitalDays) : null,
      });
      r.st.value = r.before.plus(share);
      r.st.pending = [];
    });
    last = { at, day };
  }

  return [...people].map(([owner, st]) => {
    const invested = st.deposits.minus(st.withdrawals);
    const currentValue = st.value.plus(sum(st.pending.map((p) => p.amount)));
    const profit = currentValue.minus(invested);
    const tax = profit.gt(0) ? profit.times(MEEZAN_TAX_RATE) : ZERO;
    return {
      owner,
      deposits: st.deposits,
      withdrawals: st.withdrawals,
      invested,
      currentValue,
      profit,
      tax,
      netProfit: profit.minus(tax),
      netValue: currentValue.minus(tax),
      periods: st.periods,
      avgDailyRate: combinedDailyRate([st.periods]),
    };
  });
}

/** Average daily rate across several holdings' periods (weighted by rupee-days). */
export function combinedDailyRate(
  periodLists: readonly (readonly MeezanPeriod[])[],
): Decimal | null {
  const all = periodLists.flat().filter((p) => p.capitalDays.gt(0));
  return safeDiv(sum(all.map((p) => p.profit)), sum(all.map((p) => p.capitalDays)));
}

export interface Rates {
  daily: Decimal;
  /** Compounded over an average month (365/12 days). */
  monthly: Decimal;
  /** Compounded over a year. */
  yearly: Decimal;
}

export function ratesFromDaily(daily: Value): Rates {
  const growth = d(daily).plus(1);
  return {
    daily: d(daily),
    monthly: growth.pow(DAYS_PER_YEAR / 12).minus(1),
    yearly: growth.pow(DAYS_PER_YEAR).minus(1),
  };
}

export function afterTax(profit: Value): Decimal {
  const p = d(profit);
  return p.gt(0) ? p.times(d(1).minus(MEEZAN_TAX_RATE)) : p;
}

export interface ProjectionRow {
  year: number;
  contributed: Decimal;
  value: Decimal;
  profit: Decimal;
  tax: Decimal;
  netValue: Decimal;
}

/**
 * Month-by-month growth with profit reinvested. Each month's SIP is added at the start of the
 * month and earns that month. Tax is 15% of total profit, taken at the end (on withdrawal).
 */
export function project(args: {
  start: Value;
  monthlySip: Value;
  years: number;
  monthlyRate: Value;
}): ProjectionRow[] {
  const growth = d(args.monthlyRate).plus(1);
  const sip = d(args.monthlySip);
  let value = d(args.start);
  let contributed = d(args.start);
  const rows: ProjectionRow[] = [];
  for (let month = 1; month <= args.years * 12; month++) {
    value = value.plus(sip).times(growth);
    contributed = contributed.plus(sip);
    if (month % 12 === 0) {
      const profit = value.minus(contributed);
      const tax = profit.gt(0) ? profit.times(MEEZAN_TAX_RATE) : ZERO;
      rows.push({ year: month / 12, contributed, value, profit, tax, netValue: value.minus(tax) });
    }
  }
  return rows;
}
