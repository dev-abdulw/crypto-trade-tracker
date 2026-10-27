import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PersonTotals } from '../data/funds';
import { parseDecimal } from '../lib/fillMath';
import { ownerLabel, project, ratesFromDaily } from '../lib/meezan';
import { formatPct, formatRs, ZERO, type Decimal } from '../lib/money';
import { ProjectionChart } from './charts';
import { Card, ErrorText, Field, inputClass, primaryLinkClass, Segmented, Stat } from './ui';

// Shared building blocks for the Funds (Al Meezan) screens.

export function Rs({
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

export function Section({
  title,
  children,
  actions,
  className = '',
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg">{title}</h2>
        {actions}
      </div>
      {children}
    </Card>
  );
}

/** Explains a missing table, a load error, a loading state, or an empty account. */
export function FundsStatus({
  missingTable,
  error,
  isLoading,
  isEmpty,
}: {
  missingTable: boolean;
  error: unknown;
  isLoading: boolean;
  isEmpty: boolean;
}) {
  if (missingTable) {
    return (
      <p className="rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm text-accent-strong">
        This section needs a database update: run <code>supabase/migrations/0003_meezan.sql</code>{' '}
        in the Supabase SQL Editor, then reload.
      </p>
    );
  }
  if (error) return <ErrorText error={error} />;
  if (isLoading) return <div className="h-48 animate-pulse rounded-3xl bg-card" />;
  if (isEmpty) {
    return (
      <Card className="text-center py-10">
        <h2 className="font-display text-xl mb-2">Start tracking your funds</h2>
        <p className="text-sm text-muted mb-5 max-w-sm mx-auto">
          Add the money each person put in, then update the balance from the Al Meezan app every day
          or two.
        </p>
        <Link to="/funds/new?kind=deposit" className={primaryLinkClass}>
          Add investment
        </Link>
      </Card>
    );
  }
  return null;
}

/** Family / per-person switch, shown when more than one person has money in. */
export function PersonSwitch({
  people,
  value,
  onChange,
}: {
  people: PersonTotals[];
  value: string;
  onChange: (owner: string) => void;
}) {
  if (people.length < 2) return null;
  return (
    <Segmented
      value={value}
      onChange={onChange}
      className="flex-wrap"
      options={[
        { value: 'all', label: 'Family' },
        ...people.map((p) => ({ value: p.owner, label: ownerLabel(p.owner) })),
      ]}
    />
  );
}

/** Growth with profit reinvested, with and without a monthly SIP, before and after tax. */
export function Projection({
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

  const customDaily = () => {
    const yearly = parseDecimal(customPct);
    return yearly && yearly.gt(-100)
      ? yearly
          .div(100)
          .plus(1)
          .pow(1 / 365)
          .minus(1)
      : null;
  };
  const daily = basis === 'custom' ? customDaily() : basis === 'latest' ? latestDaily : avgDaily;
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
    <div className="space-y-4">
      <Card className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
            <span className="font-display text-xl text-gold">
              {rates ? formatPct(rates.yearly, { sign: false }) : '—'}
            </span>
          </Stat>
        )}
      </Card>

      {!rates && (
        <Card>
          <p className="text-sm text-muted">
            Projections start after two balance updates (so a daily rate can be measured), or pick a
            custom rate.
          </p>
        </Card>
      )}

      {result && lastBase && (
        <>
          <div className={`grid gap-4 ${lastSip ? 'sm:grid-cols-2' : ''}`}>
            {[
              { title: 'Reinvest only', row: lastBase },
              ...(lastSip ? [{ title: `With ${formatRs(sip)} / month`, row: lastSip }] : []),
            ].map(({ title, row }) => (
              <Card key={title}>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                  {title} · after {years} {years === 1 ? 'year' : 'years'}
                </div>
                <div className="mt-2 font-display text-3xl text-gold">{formatRs(row.netValue)}</div>
                <div className="text-xs text-muted mt-1">after 15% tax</div>
                <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
                  {(
                    [
                      ['You put in', row.contributed],
                      ['Value before tax', row.value],
                      ['Profit', row.profit],
                      ['Tax (15%)', row.tax],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="flex justify-between">
                      <dt className="text-muted">{label}</dt>
                      <dd>{formatRs(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ))}
          </div>
          <Section title="Growth after tax">
            <ProjectionChart
              data={result.base.map((r, i) => ({
                year: r.year,
                reinvest: r.netValue.toNumber(),
                sip: result.withSip ? result.withSip[i]!.netValue.toNumber() : null,
              }))}
            />
            <p className="mt-3 text-xs text-muted">
              Assumes today’s rate holds, profit is reinvested monthly, SIP is added at the start of
              each month, and 15% tax is paid on the total profit when withdrawn. Fund rates change,
              so treat this as an estimate.
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
