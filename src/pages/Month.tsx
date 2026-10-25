import { addMonths, format, subMonths } from 'date-fns';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CumulativeChart, PnlBars } from '../components/charts';
import { Button, Card, ErrorText, inputClass, Pnl, Stat } from '../components/ui';
import { useOverview, useSaveMonthNotes } from '../data/months';
import { formatDate, formatDuration } from '../lib/dates';
import { formatPct, formatUsdt } from '../lib/money';
import { buildMonthlyReport, monthKey, monthStart, type TradeStat } from '../lib/monthly';
import type { MonthSnapshotRow } from '../lib/types';

const KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function TradeLink({ t, by }: { t: TradeStat | null; by: 'usdt' | 'pct' }) {
  if (!t) return <span className="text-muted">—</span>;
  return (
    <Link to={`/trades/${t.positionId}`} className="hover:underline">
      {t.symbol}{' '}
      {by === 'usdt' ? (
        <Pnl value={t.realizedPnl} />
      ) : (
        <span className={t.pnlPct?.gte(0) ? 'text-profit' : 'text-loss'}>
          {formatPct(t.pnlPct)}
        </span>
      )}
    </Link>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="text-sm font-medium mb-3">{title}</h2>
      {children}
    </Card>
  );
}

function MonthNotes({ month, snapshot }: { month: string; snapshot?: MonthSnapshotRow }) {
  const save = useSaveMonthNotes();
  const [notes, setNotes] = useState(snapshot?.notes ?? '');
  const dirty = notes !== (snapshot?.notes ?? '');
  return (
    <Section title="Month review">
      <textarea
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What worked, what didn't, what to change next month…"
        className={inputClass}
      />
      <ErrorText error={save.error} />
      {dirty && (
        <div className="mt-2 flex justify-end">
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() => save.mutate({ month, notes: notes.trim() || null })}
          >
            Save review
          </Button>
        </div>
      )}
    </Section>
  );
}

export default function Month() {
  const { month = '' } = useParams();
  const overview = useOverview();
  const data = overview.data;
  const valid = KEY_RE.test(month);
  const isCurrent = month === monthKey(new Date());
  const snapshot = overview.snapshots.get(month);

  const report = useMemo(
    () =>
      data && valid
        ? buildMonthlyReport(month, data.flows, data.reportPositions, data.adjustments)
        : null,
    [data, month, valid],
  );

  if (!valid) return <p className="text-sm text-muted">Unknown month.</p>;
  const start = monthStart(month);
  const prev = monthKey(subMonths(start, 1));
  const next = monthKey(addMonths(start, 1));
  const hasNext = next <= monthKey(new Date());

  const unrealized = isCurrent
    ? data?.account.unrealizedPnl
    : (snapshot?.unrealized_pnl_at_close ?? null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/months" className="text-muted text-sm hover:text-fg">
          ← Months
        </Link>
        <h1 className="text-xl font-semibold flex-1">{format(start, 'MMMM yyyy')}</h1>
        <Link
          to={`/months/${prev}`}
          className="text-muted hover:text-fg px-2"
          aria-label="Previous month"
        >
          ‹
        </Link>
        {hasNext && (
          <Link
            to={`/months/${next}`}
            className="text-muted hover:text-fg px-2"
            aria-label="Next month"
          >
            ›
          </Link>
        )}
      </div>

      <ErrorText error={overview.error} />
      {!report && <div className="h-48 animate-pulse rounded-xl bg-card" />}

      {report && (
        <>
          <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="P&L">
              <Pnl value={report.pnl} className="text-lg" />
              {!report.adjustmentsPnl.isZero() && (
                <div className="text-xs font-normal text-muted">
                  trades <Pnl value={report.realizedPnl} /> · adjustments{' '}
                  <Pnl value={report.adjustmentsPnl} />
                </div>
              )}
            </Stat>
            <Stat label="Return (time-weighted)">
              {formatPct(report.returnPct)}
              <div className="text-xs text-muted font-normal">
                simple {formatPct(report.simpleReturnPct)}
              </div>
            </Stat>
            <Stat label="Start → end capital">
              {formatUsdt(report.startCapital)} → {formatUsdt(report.endCapital)}
            </Stat>
            <Stat label={isCurrent ? 'Unrealized now' : 'Unrealized at month end'}>
              {unrealized !== null && unrealized !== undefined ? (
                <Pnl value={unrealized} />
              ) : (
                <span className="text-muted text-sm font-normal">not recorded</span>
              )}
            </Stat>
            <Stat label="Deposits">{formatUsdt(report.deposits)}</Stat>
            <Stat label="Withdrawals">{formatUsdt(report.withdrawals)}</Stat>
            <Stat label="Fees paid">{formatUsdt(report.feesUsdt)}</Stat>
            {!isCurrent && snapshot?.portfolio_value_at_close && (
              <Stat label="Portfolio value at close">
                {formatUsdt(snapshot.portfolio_value_at_close)}
              </Stat>
            )}
          </Card>

          <Card className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Trades closed">
              {report.closedCount}
              <span className="text-xs text-muted font-normal">
                {' '}
                ({report.wins}W / {report.losses}L)
              </span>
            </Stat>
            <Stat label="Win rate">{formatPct(report.winRate, { sign: false })}</Stat>
            <Stat label="Profit factor">
              {report.profitFactor
                ? report.profitFactor.toDecimalPlaces(2).toFixed()
                : report.wins > 0
                  ? '∞'
                  : '—'}
            </Stat>
            <Stat label="Avg win / avg loss">
              <Pnl value={report.avgWin} /> / <Pnl value={report.avgLoss} />
            </Stat>
            <Stat label="Best trade ($)">
              <TradeLink t={report.bestByUsdt} by="usdt" />
            </Stat>
            <Stat label="Worst trade ($)">
              <TradeLink t={report.worstByUsdt} by="usdt" />
            </Stat>
            <Stat label="Best trade (%)">
              <TradeLink t={report.bestByPct} by="pct" />
            </Stat>
            <Stat label="Worst trade (%)">
              <TradeLink t={report.worstByPct} by="pct" />
            </Stat>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Cumulative P&L">
              <CumulativeChart
                data={report.daily.map((x) => ({
                  date: x.date,
                  pnl: x.pnl.toNumber(),
                  cumulative: x.cumulative.toNumber(),
                }))}
              />
            </Section>
            <Section title="P&L by coin">
              {report.pnlByCoin.length === 0 ? (
                <p className="text-sm text-muted">No sells this month.</p>
              ) : (
                <PnlBars
                  label="Realized profit or loss per coin"
                  height={192}
                  data={report.pnlByCoin.map((c) => ({
                    key: c.symbol,
                    label: c.symbol,
                    pnl: c.pnl.toNumber(),
                  }))}
                />
              )}
            </Section>
          </div>

          <Section title="Day trades vs swing trades">
            <div className="grid grid-cols-2 gap-4">
              {(['day', 'swing'] as const).map((style) => (
                <Stat key={style} label={style === 'day' ? 'Day trades' : 'Swing trades'}>
                  {report.styleSplit[style].count} · <Pnl value={report.styleSplit[style].pnl} />
                </Stat>
              ))}
            </div>
          </Section>

          <Card className="p-0">
            <h2 className="text-sm font-medium px-4 pt-4 pb-2">Trades closed this month</h2>
            {report.closedTrades.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted">None.</p>
            ) : (
              <ul className="divide-y divide-border">
                {[...report.closedTrades]
                  .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
                  .map((t) => {
                    const view = data?.views.find((v) => v.row.id === t.positionId);
                    return (
                      <li key={t.positionId}>
                        <Link
                          to={`/trades/${t.positionId}`}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface/50"
                        >
                          <span className="font-medium w-16">{t.symbol}</span>
                          <span className="text-xs text-muted flex-1">
                            {formatDate(t.closedAt)} · {t.style}
                            {view?.summary &&
                              ` · held ${formatDuration(view.summary.holdingTimeMs)}`}
                          </span>
                          <Pnl value={t.realizedPnl} pct={t.pnlPct} className="tabular-nums" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Card>

          <MonthNotes
            key={`${month}:${snapshot?.updated_at ?? ''}`}
            month={month}
            snapshot={snapshot}
          />
        </>
      )}
    </div>
  );
}
