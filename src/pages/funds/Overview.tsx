import { Plus, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { FundsStatus, PersonSwitch, Rs, Section } from '../../components/funds';
import PageHeader from '../../components/PageHeader';
import { Card, Hero, primaryLinkClass, secondaryLinkClass, Stat } from '../../components/ui';
import { useFunds } from '../../data/funds';
import { sinceText } from '../../lib/dates';
import { ownerLabel, ratesFromDaily } from '../../lib/meezan';
import { formatLakh, formatPct, formatRs } from '../../lib/money';

export default function FundsOverview() {
  const funds = useFunds();
  const [params, setParams] = useSearchParams();
  const who = params.get('who') ?? 'all';
  const totals = funds.totalsFor(who);
  const rates = totals.avgDaily ? ratesFromDaily(totals.avgDaily) : null;
  const latest = totals.latestDaily ? ratesFromDaily(totals.latestDaily) : null;
  const ready = !funds.isLoading && !funds.missingTable && !funds.error && !funds.isEmpty;

  return (
    <>
      <PageHeader
        eyebrow="Al Meezan"
        title="Funds"
        actions={
          ready && (
            <div className="flex gap-2">
              <Link to="/funds/new?kind=deposit" className={secondaryLinkClass}>
                <Plus size={16} /> Add money
              </Link>
              <Link to="/funds/new?kind=valuation" className={primaryLinkClass}>
                <RefreshCw size={15} /> Update balance
              </Link>
            </div>
          )
        }
      />
      <FundsStatus {...funds} />

      {ready && (
        <div className="space-y-4">
          <PersonSwitch
            people={funds.people}
            value={who}
            onChange={(o) => setParams(o === 'all' ? {} : { who: o }, { replace: true })}
          />

          <Hero
            label={who === 'all' ? 'Family portfolio' : `${ownerLabel(who)} share`}
            value={formatRs(totals.value)}
            sub={
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <Rs v={totals.profit} sign /> <span className="text-muted">profit</span>
                </span>
                <span>
                  <Rs v={totals.netProfit} sign /> <span className="text-muted">after 15% tax</span>
                </span>
              </span>
            }
            aside={
              rates && (
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Yearly</div>
                  <div className="font-display text-3xl text-gold">
                    {formatPct(rates.yearly, { sign: false })}
                  </div>
                </div>
              )
            }
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card>
              <Stat label="Invested">{formatRs(totals.invested)}</Stat>
              <div className="text-xs text-muted mt-1">{formatLakh(totals.invested)}</div>
            </Card>
            <Card>
              <Stat label="Value">{formatRs(totals.value)}</Stat>
              <div className="text-xs text-muted mt-1">{formatLakh(totals.value)}</div>
            </Card>
            <Card>
              <Stat label="Tax on profit">{formatRs(totals.tax)}</Stat>
              <div className="text-xs text-muted mt-1">15% of profit</div>
            </Card>
            <Card>
              <Stat label="Last update">
                {funds.lastUpdate ? sinceText(funds.lastUpdate) : '—'}
              </Stat>
              {totals.addedSinceUpdate?.gt(0) && (
                <div className="text-xs text-muted mt-1">
                  {formatRs(totals.addedSinceUpdate)} added since
                </div>
              )}
            </Card>
          </div>

          <Section title="Profit rate">
            {!rates ? (
              <p className="text-sm text-muted">
                Needs at least two balance updates. Add today’s balance, then again in a day or two.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {(
                    [
                      ['Daily', `${rates.daily.times(100).toDecimalPlaces(4).toFixed()}%`],
                      ['Monthly', formatPct(rates.monthly, { sign: false })],
                      ['Yearly', formatPct(rates.yearly, { sign: false })],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label}>
                      <div className="text-[11px] font-medium uppercase tracking-wider text-muted">
                        {label}
                      </div>
                      <div className="mt-1 font-display text-2xl">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted">
                  Average since the start
                  {latest && ` · latest period ${formatPct(latest.yearly, { sign: false })} a year`}
                </p>
              </>
            )}
          </Section>

          <Section title="Accounts">
            <ul className="divide-y divide-border/70 -my-2">
              {funds.holdings.map((h) => {
                const yearly = h.summary.avgDailyRate
                  ? ratesFromDaily(h.summary.avgDailyRate).yearly
                  : null;
                return (
                  <li key={h.fund} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 font-display text-accent ring-1 ring-accent/20">
                      {h.fund[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{h.fund}</div>
                      <div className="text-xs text-muted">
                        Shared · {h.shares.length} {h.shares.length === 1 ? 'person' : 'people'}
                        {yearly && ` · ${formatPct(yearly, { sign: false })} a year`}
                        {h.summary.lastUpdate && ` · updated ${sinceText(h.summary.lastUpdate.at)}`}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-medium">{formatRs(h.summary.currentValue)}</div>
                      <Rs v={h.summary.profit} sign className="text-xs" />
                    </div>
                    <Link
                      to={`/funds/new?kind=valuation&fund=${h.fund}`}
                      className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted hover:border-accent/50 hover:text-accent"
                      aria-label={`Update ${h.fund} balance`}
                    >
                      <RefreshCw size={15} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}
