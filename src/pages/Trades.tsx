import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { Card, ErrorText, Pnl, StatusBadge } from '../components/ui';
import PriceStatus from '../components/PriceStatus';
import { useLivePortfolio } from '../data/prices';
import { formatDate, formatDuration } from '../lib/dates';
import { formatPrice, formatQty } from '../lib/money';

type StatusFilter = 'all' | 'open' | 'closed';

export default function Trades() {
  const portfolio = useLivePortfolio();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const q = search.trim().toUpperCase();
  const rows = (portfolio.data ?? []).filter(
    (p) => (status === 'all' || p.row.status === status) && (!q || p.row.symbol.includes(q)),
  );

  return (
    <>
      <PageHeader
        title="Trades"
        actions={
          <Link
            to="/trades/new"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            New trade
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex gap-1 rounded-md bg-card p-1 text-sm">
          {(['all', 'open', 'closed'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded px-3 py-1 capitalize ${status === s ? 'bg-surface text-fg' : 'text-muted'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <input
          placeholder="Search coin"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="mb-2 flex justify-end">
        <PriceStatus prices={portfolio.prices} />
      </div>
      {portfolio.isLoading && <p className="text-sm text-muted">Loading…</p>}
      <ErrorText error={portfolio.error} />
      {portfolio.data && rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            {portfolio.data.length === 0
              ? 'No trades yet. Log your first one with “New trade”.'
              : 'No trades match.'}
          </p>
        </Card>
      )}

      <ul className="space-y-2">
        {rows.map(({ row, summary, error }) => (
          <li key={row.id}>
            <Link
              to={`/trades/${row.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 hover:border-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{row.symbol}</span>
                  <StatusBadge status={row.status} />
                  {row.setup && <span className="text-xs text-muted truncate">{row.setup}</span>}
                </div>
                <div className="text-xs text-muted mt-0.5">
                  {formatDate(row.opened_at)}
                  {summary &&
                    (row.status === 'open'
                      ? ` · ${formatQty(summary.remainingQty)} @ ${formatPrice(summary.avgEntry)}`
                      : ` · held ${formatDuration(summary.holdingTimeMs)}`)}
                </div>
              </div>
              <div className="text-right text-sm tabular-nums">
                {error ? (
                  <span className="text-loss text-xs">needs fixing</span>
                ) : (
                  summary && (
                    <>
                      {summary.costOfSold.gt(0) ? (
                        <Pnl value={summary.realizedPnl} pct={summary.pnlPct} />
                      ) : (
                        row.status === 'closed' && <span className="text-muted">—</span>
                      )}
                      {summary.unrealizedPnl && (
                        <div className="text-xs">
                          <span className="text-muted">open </span>
                          <Pnl value={summary.unrealizedPnl} pct={summary.unrealizedPct} />
                        </div>
                      )}
                    </>
                  )
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
