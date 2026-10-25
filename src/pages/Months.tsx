import { format } from 'date-fns';
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PnlBars } from '../components/charts';
import PageHeader from '../components/PageHeader';
import { Card, ErrorText, Pnl } from '../components/ui';
import { useOverview } from '../data/months';
import { formatPct } from '../lib/money';
import { buildMonthlyReport, monthKeysBetween, monthStart } from '../lib/monthly';

export default function Months() {
  const overview = useOverview();
  const navigate = useNavigate();
  const data = overview.data;

  const reports = useMemo(() => {
    if (!data?.firstActivity) return [];
    return monthKeysBetween(data.firstActivity, new Date()).map((key) =>
      buildMonthlyReport(key, data.flows, data.reportPositions),
    );
  }, [data]);

  const chart = reports.slice(-12).map((r) => ({
    key: r.month,
    label: format(r.start, 'MMM'),
    pnl: r.realizedPnl.toNumber(),
  }));

  return (
    <>
      <PageHeader title="Monthly" />
      <ErrorText error={overview.error} />
      {overview.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {data && reports.length === 0 && (
        <Card>
          <p className="text-sm text-muted">
            No activity yet. Months appear once you log a deposit or trade.
          </p>
        </Card>
      )}

      {reports.length > 0 && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-medium mb-3">Realized P&L, last 12 months</h2>
            <PnlBars
              data={chart}
              label="Realized profit or loss per month"
              onSelect={(d) => d.key && navigate(`/months/${d.key}`)}
            />
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_8rem_5rem_4rem_5rem] gap-x-4 px-4 py-2 text-xs text-muted">
              <span>Month</span>
              <span className="text-right">P&L</span>
              <span className="text-right">Return</span>
              <span className="hidden sm:block text-right">Trades</span>
              <span className="hidden sm:block text-right">Win rate</span>
            </div>
            <ul className="divide-y divide-border">
              {[...reports].reverse().map((r) => {
                const tone = r.realizedPnl.gt(0)
                  ? 'border-l-profit'
                  : r.realizedPnl.lt(0)
                    ? 'border-l-loss'
                    : 'border-l-transparent';
                return (
                  <li key={r.month}>
                    <Link
                      to={`/months/${r.month}`}
                      className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_8rem_5rem_4rem_5rem] items-center gap-x-4 border-l-4 ${tone} px-4 py-3 text-sm tabular-nums hover:bg-surface/50`}
                    >
                      <span className="font-medium">
                        {format(monthStart(r.month), 'MMMM yyyy')}
                      </span>
                      <Pnl value={r.realizedPnl} className="text-right" />
                      <span className="text-right text-muted">{formatPct(r.returnPct)}</span>
                      <span className="hidden sm:block text-right">{r.closedCount}</span>
                      <span className="hidden sm:block text-right text-muted">
                        {formatPct(r.winRate, { sign: false })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
