import { differenceInCalendarDays, format } from 'date-fns';
import { useMemo, useState, type ReactNode } from 'react';
import { ProjectionChart } from '../components/charts';
import MeezanEntryForm from '../components/MeezanEntryForm';
import PageHeader from '../components/PageHeader';
import { Button, Card, ErrorText, Field, inputClass, Modal, Stat } from '../components/ui';
import { useDeleteMeezanEntry, useMeezanEntries } from '../data/meezan';
import { formatDateTime } from '../lib/dates';
import { parseDecimal } from '../lib/fillMath';
import {
  combinedDailyRate,
  MEEZAN_OWNERS,
  ownerLabel,
  ownerShares,
  project,
  ratesFromDaily,
  summarizeHolding,
  type HoldingSummary,
  type OwnerShare,
  type MeezanFund,
  type MeezanKind,
} from '../lib/meezan';
import { formatLakh, formatPct, formatRs, sum, ZERO, type Decimal } from '../lib/money';
import type { MeezanEntryRow } from '../lib/types';

/** One fund = one shared account, split between family members. */
interface Holding {
  fund: MeezanFund;
  entries: MeezanEntryRow[];
  summary: HoldingSummary;
  shares: OwnerShare[];
}

type Dialog = {
  kind: MeezanKind;
  defaults?: { owner?: string; fund: MeezanFund };
  row?: MeezanEntryRow;
} | null;

/** Lists people in the family order (Mine, Junaid, Usama, Dad), then anyone else. */
function ownerOrder(a: string, b: string): number {
  const i = (id: string) => {
    const n = MEEZAN_OWNERS.findIndex((o) => o.id === id);
    return n === -1 ? MEEZAN_OWNERS.length : n;
  };
  return i(a) - i(b) || a.localeCompare(b);
}

function Rs({
  v,
  sign,
  className = '',
}: {
  v: Decimal | null;
  sign?: boolean;
  className?: string;
}) {
  const tone = !sign || !v ? '' : v.gt(0) ? 'text-profit' : v.lt(0) ? 'text-loss' : '';
  return <span className={`${tone} ${className}`}>{formatRs(v, { sign })}</span>;
}

function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">{title}</h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

function sinceText(at: Date): string {
  const days = differenceInCalendarDays(new Date(), at);
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}

function Projection({
  start,
  avgDaily,
  latestDaily,
}: {
  start: Decimal;
  avgDaily: Decimal | null;
  latestDaily: Decimal | null;
}) {
  const [sipText, setSipText] = useState('');
  const [years, setYears] = useState(10);
  const [basis, setBasis] = useState<'avg' | 'latest' | 'custom'>('avg');
  const [customPct, setCustomPct] = useState('');

  const daily =
    basis === 'custom'
      ? (() => {
          const yearly = parseDecimal(customPct);
          return yearly && yearly.gt(-100)
            ? yearly
                .div(100)
                .plus(1)
                .pow(1 / 365)
                .minus(1)
            : null;
        })()
      : basis === 'latest'
        ? latestDaily
        : avgDaily;
  const sip = parseDecimal(sipText) ?? ZERO;
  const rates = daily ? ratesFromDaily(daily) : null;

  // At most 360 monthly steps per scenario, so this is cheap to redo on each render.
  const result = rates && {
    base: project({ start, monthlySip: 0, years, monthlyRate: rates.monthly }),
    withSip: sip.gt(0)
      ? project({ start, monthlySip: sip, years, monthlyRate: rates.monthly })
      : null,
  };

  const lastBase = result?.base[result.base.length - 1];
  const lastSip = result?.withSip?.[result.withSip.length - 1];

  return (
    <Section title="Projection (profit reinvested)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Monthly SIP (Rs)" hint="Leave empty for none">
          <input
            inputMode="decimal"
            value={sipText}
            onChange={(e) => setSipText(e.target.value)}
            className={inputClass}
            placeholder="0"
          />
        </Field>
        <Field label="Years">
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className={inputClass}
          >
            {[1, 2, 3, 5, 7, 10, 15, 20, 25, 30].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rate">
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
            className={inputClass}
          >
            <option value="avg">Average since start</option>
            <option value="latest">Latest update</option>
            <option value="custom">Custom yearly %</option>
          </select>
        </Field>
        {basis === 'custom' ? (
          <Field label="Yearly %">
            <input
              inputMode="decimal"
              value={customPct}
              onChange={(e) => setCustomPct(e.target.value)}
              className={inputClass}
              placeholder="e.g. 10"
            />
          </Field>
        ) : (
          <Stat label="Yearly rate used">
            {rates ? formatPct(rates.yearly, { sign: false }) : '—'}
          </Stat>
        )}
      </div>

      {!rates && (
        <p className="mt-3 text-sm text-muted">
          Projections start after two balance updates (so a daily rate can be measured), or pick a
          custom rate.
        </p>
      )}

      {result && lastBase && (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">After {years} years</th>
                  <th className="py-1 px-2 font-normal text-right">Reinvest only</th>
                  {lastSip && (
                    <th className="py-1 pl-2 font-normal text-right">With {formatRs(sip)}/month</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(
                  [
                    ['You put in', 'contributed'],
                    ['Value before tax', 'value'],
                    ['Profit', 'profit'],
                    ['Tax (15%)', 'tax'],
                    ['Value after tax', 'netValue'],
                  ] as const
                ).map(([label, pick]) => (
                  <tr key={label} className={label === 'Value after tax' ? 'font-semibold' : ''}>
                    <td className="py-1.5 pr-3 text-muted">{label}</td>
                    <td className="py-1.5 px-2 text-right">{formatRs(lastBase[pick])}</td>
                    {lastSip && (
                      <td className="py-1.5 pl-2 text-right">{formatRs(lastSip[pick])}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <ProjectionChart
              data={result.base.map((r, i) => ({
                year: r.year,
                reinvest: r.netValue.toNumber(),
                sip: result.withSip ? result.withSip[i]!.netValue.toNumber() : null,
              }))}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Assumes today’s rate holds, profit is reinvested monthly, SIP is added at the start of
            each month, and 15% tax is paid on the total profit when withdrawn. Fund rates change,
            so treat this as an estimate.
          </p>
        </>
      )}
    </Section>
  );
}

function HoldingRow({
  h,
  onAdd,
  onEdit,
}: {
  h: Holding;
  onAdd: (k: MeezanKind) => void;
  onEdit: (row: MeezanEntryRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const del = useDeleteMeezanEntry();
  const s = h.summary;
  const yearly = s.avgDailyRate ? ratesFromDaily(s.avgDailyRate).yearly : null;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex-1 min-w-0 text-left">
          <div className="font-medium">{h.fund} · shared account</div>
          <div className="text-xs text-muted">
            {s.lastUpdate ? `Updated ${sinceText(s.lastUpdate.at)}` : 'No balance update yet'}
            {yearly && ` · ${formatPct(yearly, { sign: false })} a year`} ·{' '}
            {open ? 'hide history' : 'show history'}
          </div>
        </button>
        <div className="text-right text-sm tabular-nums">
          <div className="font-medium">{formatRs(s.currentValue)}</div>
          <div className="text-xs">
            <Rs v={s.profit} sign /> <span className="text-muted">profit</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="primary" className="text-xs" onClick={() => onAdd('valuation')}>
            Update
          </Button>
          <Button className="text-xs" onClick={() => onAdd('deposit')}>
            Add
          </Button>
        </div>
      </div>
      {open && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border text-sm">
          {[...h.entries].reverse().map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <span className="w-28 text-xs text-muted">{formatDateTime(e.occurred_at)}</span>
              <span className="flex-1">
                {e.kind === 'valuation'
                  ? 'Balance'
                  : `${ownerLabel(e.owner)} ${e.kind === 'deposit' ? 'invested' : 'withdrew'}`}{' '}
                <span className="tabular-nums">{formatRs(e.amount_pkr)}</span>
                {e.note && <span className="text-xs text-muted"> · {e.note}</span>}
              </span>
              <button
                type="button"
                className="text-xs text-muted hover:text-fg"
                onClick={() => onEdit(e)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-xs text-muted hover:text-loss"
                disabled={del.isPending}
                onClick={() => confirm('Delete this entry?') && del.mutate(e.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={del.error} />
    </li>
  );
}

/** Who put in how much, and what their share is worth now. */
function Contributions({
  rows,
  total,
  onSelect,
}: {
  rows: { owner: string; invested: Decimal; value: Decimal; profit: Decimal; netProfit: Decimal }[];
  total: Decimal;
  onSelect: (owner: string) => void;
}) {
  return (
    <Card className="p-0">
      <h2 className="text-sm font-medium px-4 pt-4 pb-2">Who invested how much</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-xs text-muted">
            <tr className="text-left">
              <th className="px-4 py-2 font-normal">Person</th>
              <th className="px-2 py-2 font-normal text-right">Invested</th>
              <th className="px-2 py-2 font-normal text-right">Share now</th>
              <th className="px-2 py-2 font-normal text-right">Profit</th>
              <th className="px-2 py-2 font-normal text-right">After tax</th>
              <th className="px-4 py-2 font-normal text-right">Of total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.owner} className="whitespace-nowrap hover:bg-surface/50">
                <td className="px-4 py-2 font-medium">
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => onSelect(r.owner)}
                  >
                    {ownerLabel(r.owner)}
                  </button>
                </td>
                <td className="px-2 py-2 text-right">{formatRs(r.invested)}</td>
                <td className="px-2 py-2 text-right">{formatRs(r.value)}</td>
                <td className="px-2 py-2 text-right">
                  <Rs v={r.profit} sign />
                </td>
                <td className="px-2 py-2 text-right">
                  <Rs v={r.netProfit} sign />
                </td>
                <td className="px-4 py-2 text-right text-muted">
                  {total.gt(0) ? formatPct(r.value.div(total), { sign: false }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Meezan() {
  const entries = useMeezanEntries();
  const [owner, setOwner] = useState<string>('all');
  const [dialog, setDialog] = useState<Dialog>(null);

  const holdings = useMemo<Holding[]>(() => {
    const groups = new Map<MeezanFund, MeezanEntryRow[]>();
    for (const e of entries.data ?? []) groups.set(e.fund, [...(groups.get(e.fund) ?? []), e]);
    return [...groups].map(([fund, rows]) => ({
      fund,
      entries: rows,
      summary: summarizeHolding(rows),
      shares: ownerShares(rows),
    }));
  }, [entries.data]);

  // Each person's totals across funds.
  const people = useMemo(() => {
    const byOwner = new Map<string, OwnerShare[]>();
    for (const h of holdings) {
      for (const sh of h.shares) byOwner.set(sh.owner, [...(byOwner.get(sh.owner) ?? []), sh]);
    }
    return [...byOwner]
      .sort(([a], [b]) => ownerOrder(a, b))
      .map(([id, shs]) => {
        const periods = shs.flatMap((x) => x.periods).filter((p) => p.capitalDays.gt(0));
        return {
          owner: id,
          invested: sum(shs.map((x) => x.invested)),
          value: sum(shs.map((x) => x.currentValue)),
          profit: sum(shs.map((x) => x.profit)),
          tax: sum(shs.map((x) => x.tax)),
          netProfit: sum(shs.map((x) => x.netProfit)),
          avgDaily: combinedDailyRate([periods]),
          latestDaily: periods[periods.length - 1]?.dailyRate ?? null,
        };
      });
  }, [holdings]);

  const lastUpdates = holdings.flatMap((h) =>
    h.summary.lastUpdate ? [h.summary.lastUpdate.at] : [],
  );
  const lastUpdate = lastUpdates.length
    ? new Date(Math.max(...lastUpdates.map((u) => u.getTime())))
    : null;

  const totals = useMemo(() => {
    const person = people.find((p) => p.owner === owner);
    if (person) {
      return { ...person, addedSinceUpdate: null as Decimal | null };
    }
    const ss = holdings.map((h) => h.summary);
    const latestEach = ss.filter((s) => s.latestDailyRate);
    return {
      value: sum(ss.map((s) => s.currentValue)),
      invested: sum(ss.map((s) => s.invested)),
      profit: sum(ss.map((s) => s.profit)),
      tax: sum(ss.map((s) => s.tax)),
      netProfit: sum(ss.map((s) => s.netProfit)),
      addedSinceUpdate: sum(ss.map((s) => s.addedSinceUpdate)) as Decimal | null,
      avgDaily: combinedDailyRate(ss.map((s) => s.periods)),
      // value-weighted latest rate across funds
      latestDaily: latestEach.length
        ? sum(latestEach.map((s) => s.latestDailyRate!.times(s.currentValue))).div(
            sum(latestEach.map((s) => s.currentValue)),
          )
        : null,
    };
  }, [holdings, people, owner]);

  const rates = totals.avgDaily ? ratesFromDaily(totals.avgDaily) : null;
  const latestRates = totals.latestDaily ? ratesFromDaily(totals.latestDaily) : null;
  const missingTable = entries.error && /meezan_entries/.test(entries.error.message);
  const familyValue = sum(holdings.map((h) => h.summary.currentValue));

  return (
    <>
      <PageHeader
        title="Al Meezan"
        actions={
          <div className="flex gap-2">
            <Button
              onClick={() =>
                setDialog({
                  kind: 'deposit',
                  defaults: owner !== 'all' ? { owner, fund: 'MIACF' } : undefined,
                })
              }
            >
              Add investment
            </Button>
            <Button variant="primary" onClick={() => setDialog({ kind: 'valuation' })}>
              Update balance
            </Button>
          </div>
        }
      />

      {missingTable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
          This tab needs a database update: run <code>supabase/migrations/0003_meezan.sql</code> in
          the Supabase SQL Editor, then reload.
        </p>
      ) : (
        <ErrorText error={entries.error} />
      )}
      {entries.isLoading && <div className="h-40 animate-pulse rounded-xl bg-card" />}

      {entries.data && holdings.length === 0 && !missingTable && (
        <Card>
          <p className="text-sm text-muted">
            No investments yet. Use “Add investment” for money put in (choose whose it is), then
            “Update balance” with the figure from the Al Meezan app every day or two.
          </p>
        </Card>
      )}

      {holdings.length > 0 && (
        <div className="space-y-4">
          {people.length > 1 && (
            <div className="flex flex-wrap gap-1 rounded-md bg-card p-1 text-sm w-fit">
              {[{ owner: 'all' }, ...people].map((p) => (
                <button
                  key={p.owner}
                  type="button"
                  onClick={() => setOwner(p.owner)}
                  className={`rounded px-3 py-1 ${owner === p.owner ? 'bg-surface text-fg' : 'text-muted'}`}
                >
                  {p.owner === 'all' ? 'Family' : ownerLabel(p.owner)}
                </button>
              ))}
            </div>
          )}

          <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label={owner === 'all' ? 'Current value' : `${ownerLabel(owner)} share`}>
              {formatRs(totals.value)}
              <div className="text-xs font-normal text-muted">{formatLakh(totals.value)}</div>
            </Stat>
            <Stat label="Invested">{formatRs(totals.invested)}</Stat>
            <Stat label="Profit so far">
              <Rs v={totals.profit} sign />
              <div className="text-xs font-normal text-muted">
                after 15% tax <Rs v={totals.netProfit} sign />
              </div>
            </Stat>
            <Stat label="Last balance update">
              {lastUpdate ? sinceText(lastUpdate) : '—'}
              {totals.addedSinceUpdate?.gt(0) && (
                <div className="text-xs font-normal text-muted">
                  {formatRs(totals.addedSinceUpdate)} added since
                </div>
              )}
            </Stat>
          </Card>

          {owner === 'all' && people.length > 0 && (
            <Contributions rows={people} total={familyValue} onSelect={setOwner} />
          )}

          <Section title="Profit rate (average since start)">
            {!rates ? (
              <p className="text-sm text-muted">
                Needs at least two balance updates. Add today’s balance, then again in a day or two.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Daily">{rates.daily.times(100).toDecimalPlaces(4).toFixed()}%</Stat>
                  <Stat label="Monthly">{formatPct(rates.monthly, { sign: false })}</Stat>
                  <Stat label="Yearly">{formatPct(rates.yearly, { sign: false })}</Stat>
                </div>
                {latestRates && (
                  <p className="mt-2 text-xs text-muted">
                    Latest update period: {formatPct(latestRates.yearly, { sign: false })} a year
                  </p>
                )}
              </>
            )}
          </Section>

          <Projection
            key={owner}
            start={totals.value}
            avgDaily={totals.avgDaily}
            latestDaily={totals.latestDaily}
          />

          <Card className="p-0">
            <h2 className="text-sm font-medium px-4 pt-4 pb-1">Funds</h2>
            <ul className="divide-y divide-border">
              {holdings.map((h) => (
                <HoldingRow
                  key={h.fund}
                  h={h}
                  onAdd={(kind) =>
                    setDialog({
                      kind,
                      defaults: { fund: h.fund, owner: owner !== 'all' ? owner : undefined },
                    })
                  }
                  onEdit={(row) => setDialog({ kind: row.kind, row })}
                />
              ))}
            </ul>
          </Card>

          {lastUpdate && (
            <p className="text-xs text-muted">
              Last balance update {format(lastUpdate, 'd MMM yyyy, HH:mm')}. Money added earns from
              the next day. Profit between updates is the balance change minus money added, shared
              between people by amount × days invested.
            </p>
          )}
        </div>
      )}

      <Modal
        open={dialog !== null}
        title={dialog?.row ? 'Edit entry' : 'Al Meezan'}
        onClose={() => setDialog(null)}
      >
        {dialog && (
          <MeezanEntryForm
            kind={dialog.kind}
            initial={dialog.row}
            defaults={dialog.defaults}
            onDone={() => setDialog(null)}
          />
        )}
      </Modal>
    </>
  );
}
