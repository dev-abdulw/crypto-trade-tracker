import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { fetchHistoricalPrice } from '../lib/coingecko';
import { monthBounds, type PositionForReport } from '../lib/monthly';
import { computeAccount } from '../lib/pnl';
import {
  buildMonthSnapshot,
  holdingsAt,
  monthClosePriceDate,
  monthsNeedingSnapshot,
  type SnapshotPositionInput,
} from '../lib/snapshot';
import { supabase } from '../lib/supabase';
import type { BalanceAdjustmentRow, MonthSnapshotRow } from '../lib/types';
import { useAdjustments } from './adjustments';
import { useCapitalFlows } from './capital';
import { fetchAll, unwrap } from './db';
import { useLivePortfolio } from './prices';
import type { PositionView } from './trades';

const SNAPSHOT_COLS =
  'id,user_id,month,start_capital::text,end_capital::text,realized_pnl::text,' +
  'unrealized_pnl_at_close::text,portfolio_value_at_close::text,notes,created_at,updated_at';

export const snapshotKeys = { all: ['month_snapshots'] as const };

export function useSnapshots() {
  return useQuery({
    queryKey: snapshotKeys.all,
    queryFn: () =>
      fetchAll<MonthSnapshotRow>((from, to) =>
        supabase.from('month_snapshots').select(SNAPSHOT_COLS).order('month').range(from, to),
      ),
  });
}

/** Snapshot rows keyed by yyyy-MM. */
function byMonth(rows: MonthSnapshotRow[] | undefined): Map<string, MonthSnapshotRow> {
  return new Map((rows ?? []).map((r) => [r.month.slice(0, 7), r]));
}

export function useSaveMonthNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ month, notes }: { month: string; notes: string | null }) => {
      unwrap(
        await supabase
          .from('month_snapshots')
          .upsert({ month: `${month}-01`, notes }, { onConflict: 'user_id,month' }),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: snapshotKeys.all }),
  });
}

function toReportPositions(views: PositionView[]): PositionForReport[] {
  return views.flatMap((v) =>
    v.summary
      ? [{ id: v.row.id, symbol: v.row.symbol, style: v.row.style, summary: v.summary }]
      : [],
  );
}

function toSnapshotInputs(views: PositionView[]): SnapshotPositionInput[] {
  return views.map((v) => ({
    id: v.row.id,
    symbol: v.row.symbol,
    coingecko_id: v.row.coingecko_id,
    closed_manually: v.row.closed_manually,
    closed_at: v.row.closed_at,
    fills: v.fills,
  }));
}

/** Everything the dashboard and month screens need, joined and computed once. */
export function useOverview() {
  const portfolio = useLivePortfolio();
  const flows = useCapitalFlows();
  const adjustmentsQuery = useAdjustments();
  const snapshots = useSnapshots();
  // If the adjustments table is missing (migration 0002 not run yet) carry on without it.
  const adjustments =
    adjustmentsQuery.data ?? (adjustmentsQuery.error ? NO_ADJUSTMENTS : undefined);

  const data = useMemo(() => {
    if (!portfolio.data || !flows.data || !adjustments) return undefined;
    const views = portfolio.data;
    const reportPositions = toReportPositions(views);
    const times = [
      ...flows.data.map((f) => new Date(f.occurred_at).getTime()),
      ...adjustments.map((a) => new Date(a.occurred_at).getTime()),
      ...views.flatMap((v) => v.fills.map((f) => new Date(f.executed_at).getTime())),
    ];
    return {
      views,
      flows: flows.data,
      adjustments,
      reportPositions,
      account: computeAccount(
        flows.data,
        reportPositions.map((p) => p.summary),
        adjustments,
      ),
      firstActivity: times.length ? new Date(Math.min(...times)) : null,
    };
  }, [portfolio.data, flows.data, adjustments]);

  return {
    data,
    snapshots: useMemo(() => byMonth(snapshots.data), [snapshots.data]),
    snapshotsLoaded: snapshots.isSuccess,
    prices: portfolio.prices,
    adjustmentsError: adjustmentsQuery.error,
    isLoading: portfolio.isLoading || flows.isLoading || adjustmentsQuery.isLoading,
    error: portfolio.error ?? flows.error ?? snapshots.error,
  };
}

const NO_ADJUSTMENTS: BalanceAdjustmentRow[] = [];

let snapshotRun: Promise<void> | null = null;

/**
 * The first time the app runs after a month ends, freeze that month's numbers (holdings valued
 * at CoinGecko's month-close price). Runs at most once per page load.
 */
export function useEnsureSnapshots() {
  const qc = useQueryClient();
  const overview = useOverview();
  const { data, snapshots, snapshotsLoaded } = overview;

  useEffect(() => {
    if (!data || !snapshotsLoaded || snapshotRun) return;
    const done = new Set([...snapshots].filter(([, r]) => r.end_capital !== null).map(([k]) => k));
    const months = monthsNeedingSnapshot(data.firstActivity, new Date(), done);
    if (months.length === 0) return;

    snapshotRun = (async () => {
      const inputs = toSnapshotInputs(data.views);
      for (const key of months) {
        const holdings = holdingsAt(inputs, monthBounds(key).end);
        const prices: Record<string, number | undefined> = {};
        for (const id of new Set(holdings.map((h) => h.coingecko_id))) {
          const price = await fetchHistoricalPrice(id, monthClosePriceDate(key)).catch(() => null);
          prices[id] = price ?? undefined;
        }
        const values = buildMonthSnapshot(
          key,
          data.flows,
          data.reportPositions,
          holdings,
          prices,
          data.adjustments,
        );
        const { error } = await supabase
          .from('month_snapshots')
          .upsert(values, { onConflict: 'user_id,month' });
        if (error) throw new Error(error.message);
      }
      await qc.invalidateQueries({ queryKey: snapshotKeys.all });
    })().catch((e) => {
      console.warn('Month snapshot failed', e);
      snapshotRun = null; // retry on next load
    });
  }, [data, snapshots, snapshotsLoaded, qc]);
}
