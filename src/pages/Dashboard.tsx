import { format, subMonths } from 'date-fns';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import AdjustBalanceForm from '../components/AdjustBalanceForm';
import { EquityChart } from '../components/charts';
import PageHeader from '../components/PageHeader';
import PriceStatus from '../components/PriceStatus';
import {
  Card,
  ErrorText,
  Hero,
  Modal,
  Pnl,
  primaryLinkClass,
  secondaryLinkClass,
} from '../components/ui';
import { useOverview } from '../data/months';
import type { PositionView } from '../data/trades';
import { formatDate, formatDuration } from '../lib/dates';
import { equitySeries } from '../lib/equity';
import { formatPct, formatPrice, formatQty, formatUsdt, safeDiv, d } from '../lib/money';
import { buildMonthlyReport, monthBounds, monthKey, monthStart } from '../lib/monthly';
import { dismissRecap, getDismissedRecap } from '../lib/settings';

function Kpi({
  label,
  children,
  sub,
  action,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
        {label}
        {action}
      </div>
      <div className="mt-2 font-display text-2xl tabular-nums">{children}</div>
      {sub && <div className="text-xs tabular-nums">{sub}</div>}
    </Card>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-card ${className}`} />;
}

function Distance({ to, live }: { to: string | number | null; live: ReturnType<typeof d> | null }) {
  if (!to || !live) return <span className="text-muted">—</span>;
  const pct = safeDiv(d(to).minus(live), live);
  return (
    <span>
      {formatPrice(to)} <span className="text-muted text-xs">({formatPct(pct)})</span>
    </span>
  );
}

function OpenPositions({ open }: { open: PositionView[] }) {
  if (open.length === 0) {
    return <p className="px-4 pb-4 text-sm text-muted">No open positions.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-xs text-muted">
          <tr className="text-left">
            <th className="px-4 py-2 font-normal">Coin</th>
            <th className="px-2 py-2 font-normal text-right">Qty</th>
            <th className="px-2 py-2 font-normal text-right">Avg entry</th>
            <th className="px-2 py-2 font-normal text-right">Live</th>
            <th className="px-2 py-2 font-normal text-right">Unrealized</th>
            <th className="px-2 py-2 font-normal text-right">Age</th>
            <th className="px-2 py-2 font-normal text-right">Target</th>
            <th className="px-4 py-2 font-normal text-right">Stop</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {open.map(({ row, summary }) => (
            <tr key={row.id} className="whitespace-nowrap hover:bg-surface/50">
              <td className="px-4 py-2 font-medium">
                <Link to={`/trades/${row.id}`} className="hover:underline">
                  {row.symbol}
                </Link>
              </td>
              <td className="px-2 py-2 text-right">{formatQty(summary!.remainingQty)}</td>
              <td className="px-2 py-2 text-right">{formatPrice(summary!.avgEntry)}</td>
              <td className="px-2 py-2 text-right">{formatPrice(summary!.livePrice)}</td>
              <td className="px-2 py-2 text-right">
                <Pnl value={summary!.unrealizedPnl} pct={summary!.unrealizedPct} />
              </td>
              <td className="px-2 py-2 text-right text-muted">
                {summary!.firstFillAt
                  ? formatDuration(Date.now() - summary!.firstFillAt.getTime())
                  : '—'}
              </td>
              <td className="px-2 py-2 text-right">
                <Distance to={row.target_price} live={summary!.livePrice} />
              </td>
              <td className="px-4 py-2 text-right">
                <Distance to={row.stop_price} live={summary!.livePrice} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const overview = useOverview();
  const [dismissed, setDismissed] = useState(getDismissedRecap);
  const [adjusting, setAdjusting] = useState(false);
  const data = overview.data;

  const derived = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const thisMonth = buildMonthlyReport(
      monthKey(now),
      data.flows,
      data.reportPositions,
      data.adjustments,
    );
    const prevKey = monthKey(subMonths(now, 1));
    const hadActivityBefore =
      data.firstActivity !== null && data.firstActivity < monthBounds(prevKey).end;
    const recap = hadActivityBefore
      ? buildMonthlyReport(prevKey, data.flows, data.reportPositions, data.adjustments)
      : null;
    const valid = data.views.filter((v) => v.summary);
    return {
      thisMonth,
      prevKey,
      recap,
      equity: equitySeries(
        data.flows,
        data.reportPositions.map((p) => p.summary),
        data.adjustments,
      ),
      open: valid.filter((v) => v.row.status === 'open' && v.summary!.remainingQty.gt(0)),
      recentClosed: valid
        .filter((v) => v.row.status === 'closed' && v.summary!.closedAt)
        .sort((a, b) => b.summary!.closedAt!.getTime() - a.summary!.closedAt!.getTime())
        .slice(0, 5),
    };
  }, [data]);

  const header = (
    <PageHeader
      eyebrow="Crypto"
      title="Dashboard"
      actions={<PriceStatus prices={overview.prices} />}
    />
  );

  if (overview.isLoading || !data || !derived) {
    return (
      <>
        {header}
        <ErrorText error={overview.error} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="mt-4 h-64" />
      </>
    );
  }

  const { account } = data;
  const isEmpty = data.flows.length === 0 && data.views.length === 0;
  const recapOpen = derived.recap && dismissed !== derived.prevKey;

  return (
    <>
      {header}
      <div className="space-y-4">
        {recapOpen && derived.recap && (
          <Card className="border-accent/40 bg-accent/5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-muted">Month closed</div>
                <h2 className="font-semibold">
                  Your {format(monthStart(derived.prevKey), 'MMMM yyyy')} recap
                </h2>
              </div>
              <button
                type="button"
                className="text-muted hover:text-fg text-sm"
                onClick={() => {
                  dismissRecap(derived.prevKey);
                  setDismissed(derived.prevKey);
                }}
                aria-label="Dismiss recap"
              >
                ×
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted">P&L</div>
                <Pnl value={derived.recap.pnl} className="font-medium" />
              </div>
              <div>
                <div className="text-xs text-muted">Return</div>
                <span className="font-medium">{formatPct(derived.recap.returnPct)}</span>
              </div>
              <div>
                <div className="text-xs text-muted">Trades closed</div>
                <span className="font-medium">{derived.recap.closedCount}</span>
              </div>
              <div>
                <div className="text-xs text-muted">Win rate</div>
                <span className="font-medium">
                  {formatPct(derived.recap.winRate, { sign: false })}
                </span>
              </div>
            </div>
            <Link
              to={`/months/${derived.prevKey}`}
              className="mt-3 inline-block text-sm text-accent hover:underline"
            >
              See the full report →
            </Link>
          </Card>
        )}

        {isEmpty && (
          <Card>
            <h2 className="font-semibold mb-1">Welcome</h2>
            <p className="text-sm text-muted mb-3">
              Start by recording the USDT you deposited, then log your first trade.
            </p>
            <div className="flex gap-2">
              <Link to="/capital" className={secondaryLinkClass}>
                Add investment
              </Link>
              <Link to="/trades/new" className={primaryLinkClass}>
                New trade
              </Link>
            </div>
          </Card>
        )}

        <Hero
          label="Portfolio value"
          value={
            <>
              {formatUsdt(account.portfolioValue)}
              <span className="ml-2 align-middle font-sans text-base text-muted">USDT</span>
            </>
          }
          sub={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                <Pnl value={account.totalReturn} pct={account.totalReturnPct} />{' '}
                <span className="text-muted">all time</span>
              </span>
              {!account.adjustmentsTotal.isZero() && (
                <span className="text-muted">
                  incl. adjustments <Pnl value={account.adjustmentsTotal} />
                </span>
              )}
            </span>
          }
          aside={
            <button
              type="button"
              onClick={() => setAdjusting(true)}
              className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted hover:border-accent/40 hover:text-fg"
              title="Correct the balance to match Binance"
            >
              Edit balance
            </button>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Net invested">{formatUsdt(account.netInvested)}</Kpi>
          <Kpi label="Total return" sub={<Pnl value={account.totalReturn} />}>
            <span className={account.totalReturn.gte(0) ? 'text-profit' : 'text-loss'}>
              {formatPct(account.totalReturnPct)}
            </span>
          </Kpi>
          <Kpi
            label="This month"
            sub={<span className="text-muted">{formatPct(derived.thisMonth.returnPct)}</span>}
          >
            <Pnl value={derived.thisMonth.pnl} />
          </Kpi>
          <Kpi
            label="Unrealized P&L"
            sub={
              account.missingPrices > 0 && (
                <span className="text-muted">{account.missingPrices} without price</span>
              )
            }
          >
            <Pnl value={account.unrealizedPnl} />
          </Kpi>
          <Kpi label="Free USDT">{formatUsdt(account.cashUsdt)}</Kpi>
        </div>

        {derived.equity.length > 1 && (
          <Card>
            <h2 className="text-sm font-medium mb-3">Capital over time</h2>
            <EquityChart points={derived.equity} />
          </Card>
        )}

        <Card className="p-0">
          <h2 className="text-sm font-medium px-4 pt-4 pb-2">Open positions</h2>
          <OpenPositions open={derived.open} />
        </Card>

        <Card className="p-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-sm font-medium">Recently closed</h2>
            <Link to="/trades" className="text-xs text-muted hover:text-fg">
              All trades →
            </Link>
          </div>
          {derived.recentClosed.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted">No closed trades yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {derived.recentClosed.map(({ row, summary }) => (
                <li key={row.id}>
                  <Link
                    to={`/trades/${row.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface/50"
                  >
                    <span className="font-medium w-16">{row.symbol}</span>
                    <span className="text-xs text-muted flex-1">
                      {formatDate(summary!.closedAt!)} · held{' '}
                      {formatDuration(summary!.holdingTimeMs)}
                    </span>
                    <Pnl
                      value={summary!.realizedPnl}
                      pct={summary!.pnlPct}
                      className="text-sm tabular-nums"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Modal open={adjusting} title="Edit portfolio balance" onClose={() => setAdjusting(false)}>
        {adjusting && (
          <AdjustBalanceForm
            portfolioValue={account.portfolioValue}
            cashUsdt={account.cashUsdt}
            onDone={() => setAdjusting(false)}
          />
        )}
      </Modal>
    </>
  );
}
