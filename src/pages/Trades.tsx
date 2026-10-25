import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PriceStatus from '../components/PriceStatus';
import { Card, ErrorText, Pnl, StatusBadge } from '../components/ui';
import { useLivePortfolio } from '../data/prices';
import type { PositionView } from '../data/trades';
import { formatDate, formatDuration } from '../lib/dates';
import { formatPrice, formatQty } from '../lib/money';
import { deriveStyle, monthKey, monthStart } from '../lib/monthly';

type StatusFilter = 'all' | 'open' | 'closed';
type Outcome = '' | 'win' | 'loss';
type StyleFilter = '' | 'day' | 'swing';
type Sort = 'opened' | 'closed' | 'pnl-desc' | 'pnl-asc' | 'pct-desc';

const selectClass =
  'rounded-md border border-border bg-card px-2 py-1.5 text-sm outline-none focus:border-accent';

/** The month a position "belongs" to: when it closed, or when it opened if still open. */
function positionMonth(v: PositionView): string {
  return monthKey(v.summary?.closedAt ?? v.row.opened_at);
}

function styleOf(v: PositionView) {
  return v.summary
    ? deriveStyle({ id: v.row.id, symbol: v.row.symbol, style: v.row.style, summary: v.summary })
    : (v.row.style ?? 'swing');
}

export default function Trades() {
  const portfolio = useLivePortfolio();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [coin, setCoin] = useState('');
  const [month, setMonth] = useState('');
  const [style, setStyle] = useState<StyleFilter>('');
  const [outcome, setOutcome] = useState<Outcome>('');
  const [sort, setSort] = useState<Sort>('opened');

  const all = useMemo(() => portfolio.data ?? [], [portfolio.data]);
  const coins = useMemo(() => [...new Set(all.map((v) => v.row.symbol))].sort(), [all]);
  const months = useMemo(() => [...new Set(all.map(positionMonth))].sort().reverse(), [all]);

  const q = search.trim().toUpperCase();
  const rows = all
    .filter((v) => status === 'all' || v.row.status === status)
    .filter((v) => !q || v.row.symbol.includes(q) || (v.row.setup ?? '').toUpperCase().includes(q))
    .filter((v) => !coin || v.row.symbol === coin)
    .filter((v) => !month || positionMonth(v) === month)
    .filter((v) => !style || styleOf(v) === style)
    .filter((v) => {
      if (!outcome) return true;
      const pnl = v.summary?.realizedPnl;
      if (!pnl || v.summary?.costOfSold.isZero()) return false;
      return outcome === 'win' ? pnl.gt(0) : pnl.lt(0);
    })
    .sort((a, b) => {
      const pa = a.summary?.realizedPnl.toNumber() ?? 0;
      const pb = b.summary?.realizedPnl.toNumber() ?? 0;
      switch (sort) {
        case 'closed':
          return (b.summary?.closedAt?.getTime() ?? 0) - (a.summary?.closedAt?.getTime() ?? 0);
        case 'pnl-desc':
          return pb - pa;
        case 'pnl-asc':
          return pa - pb;
        case 'pct-desc':
          return (
            (b.summary?.pnlPct?.toNumber() ?? -Infinity) -
            (a.summary?.pnlPct?.toNumber() ?? -Infinity)
          );
        default:
          return new Date(b.row.opened_at).getTime() - new Date(a.row.opened_at).getTime();
      }
    });

  const filtered = !!(q || coin || month || style || outcome || status !== 'all');

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

      <div className="flex flex-wrap items-center gap-2 mb-4">
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
          placeholder="Search coin or setup"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${selectClass} w-44`}
        />
        <select
          value={coin}
          onChange={(e) => setCoin(e.target.value)}
          className={selectClass}
          aria-label="Coin"
        >
          <option value="">All coins</option>
          {coins.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={selectClass}
          aria-label="Month"
        >
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {format(monthStart(m), 'MMM yyyy')}
            </option>
          ))}
        </select>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as StyleFilter)}
          className={selectClass}
          aria-label="Style"
        >
          <option value="">Day + swing</option>
          <option value="day">Day trades</option>
          <option value="swing">Swing</option>
        </select>
        <select
          value={outcome}
          onChange={(e) => setOutcome(e.target.value as Outcome)}
          className={selectClass}
          aria-label="Outcome"
        >
          <option value="">Wins + losses</option>
          <option value="win">Wins</option>
          <option value="loss">Losses</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className={selectClass}
          aria-label="Sort"
        >
          <option value="opened">Newest opened</option>
          <option value="closed">Newest closed</option>
          <option value="pnl-desc">Biggest profit</option>
          <option value="pnl-asc">Biggest loss</option>
          <option value="pct-desc">Best %</option>
        </select>
        <div className="ml-auto">
          <PriceStatus prices={portfolio.prices} />
        </div>
      </div>

      {portfolio.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-card" />
          ))}
        </div>
      )}
      <ErrorText error={portfolio.error} />
      {portfolio.data && rows.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            {filtered
              ? 'No trades match these filters.'
              : 'No trades yet. Log your first one with “New trade”.'}
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
