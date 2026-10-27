import { Plus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FundsStatus, Rs } from '../../components/funds';
import PageHeader from '../../components/PageHeader';
import { Card, secondaryLinkClass } from '../../components/ui';
import { useFunds } from '../../data/funds';
import { ownerLabel, ratesFromDaily } from '../../lib/meezan';
import { formatPct, formatRs } from '../../lib/money';

export default function FundsFamily() {
  const funds = useFunds();
  const total = funds.family.value;
  const ready = !funds.isLoading && !funds.missingTable && !funds.error && !funds.isEmpty;

  return (
    <>
      <PageHeader
        eyebrow="Al Meezan"
        title="Family"
        actions={
          ready && (
            <Link to="/funds/new?kind=deposit" className={secondaryLinkClass}>
              <Plus size={16} /> Add money
            </Link>
          )
        }
      />
      <FundsStatus {...funds} />

      {ready && (
        <>
          <p className="text-sm text-muted mb-4">
            Who put in how much. Profit is shared by amount × days invested; money added on a day
            starts earning the next day.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {funds.people.map((p) => {
              const share = total.gt(0) ? p.value.div(total) : null;
              const yearly = p.avgDaily ? ratesFromDaily(p.avgDaily).yearly : null;
              return (
                <Card key={p.owner} className="relative overflow-hidden">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-accent-strong/30 to-accent/10 font-display text-lg text-accent-strong ring-1 ring-accent/30">
                        {ownerLabel(p.owner)[0]}
                      </div>
                      <div>
                        <div className="font-medium">{ownerLabel(p.owner)}</div>
                        <div className="text-xs text-muted">
                          {share ? `${formatPct(share, { sign: false })} of the family total` : ''}
                        </div>
                      </div>
                    </div>
                    {yearly && (
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs text-accent ring-1 ring-accent/25">
                        {formatPct(yearly, { sign: false })} / yr
                      </span>
                    )}
                  </div>

                  <div className="mt-5 font-display text-3xl text-gold">{formatRs(p.value)}</div>
                  <div className="text-xs text-muted">current share</div>

                  {share && (
                    <div className="mt-4 h-1.5 rounded-full bg-card-2 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-accent/60 to-accent-strong"
                        style={{ width: `${Math.max(2, share.times(100).toNumber())}%` }}
                      />
                    </div>
                  )}

                  <dl className="mt-4 grid grid-cols-3 gap-2 text-sm tabular-nums">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-muted">Invested</dt>
                      <dd className="mt-0.5">{formatRs(p.invested)}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-muted">Profit</dt>
                      <dd className="mt-0.5">
                        <Rs v={p.profit} sign />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-muted">After tax</dt>
                      <dd className="mt-0.5">
                        <Rs v={p.netProfit} sign />
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex gap-2 text-xs">
                    <Link
                      to={`/funds/new?kind=deposit&who=${p.owner}`}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-muted hover:border-accent/40 hover:text-fg"
                    >
                      Add money
                    </Link>
                    <Link
                      to={`/funds/projections?who=${p.owner}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-muted hover:border-accent/40 hover:text-fg"
                    >
                      <TrendingUp size={13} /> Projection
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
