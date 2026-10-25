import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { planMerge } from '../lib/merge';
import type { PositionSummary } from '../lib/pnl';
import { positionPatch, summarize } from '../lib/positionSync';
import { dustOptions, type AppSettings } from '../lib/settings';
import { supabase } from '../lib/supabase';
import type { FillRow, Insert, PositionRow } from '../lib/types';
import { fetchAll, FILL_COLS, POSITION_COLS, unwrap } from './db';
import { useSettings } from './settings';

export const tradeKeys = {
  positions: ['positions'] as const,
  fills: ['fills'] as const,
};

export type FillDraft = Pick<
  FillRow,
  'side' | 'quantity' | 'price_usdt' | 'fee_amount' | 'fee_asset' | 'fee_usdt' | 'executed_at'
>;

export type PositionDetailsDraft = Pick<
  PositionRow,
  'style' | 'setup' | 'target_price' | 'stop_price' | 'notes'
>;

export type NewPositionDraft = Pick<PositionRow, 'symbol' | 'coingecko_id'> & PositionDetailsDraft;

export interface PositionView {
  row: PositionRow;
  fills: FillRow[];
  /** null when the stored fills are inconsistent (see `error`). */
  summary: PositionSummary | null;
  error: string | null;
}

// ---------- reads ----------

export function usePositions() {
  return useQuery({
    queryKey: tradeKeys.positions,
    queryFn: () =>
      fetchAll<PositionRow>((from, to) =>
        supabase
          .from('positions')
          .select(POSITION_COLS)
          .order('opened_at', { ascending: false })
          .range(from, to),
      ),
  });
}

export function useFills() {
  return useQuery({
    queryKey: tradeKeys.fills,
    queryFn: () =>
      fetchAll<FillRow>((from, to) =>
        supabase
          .from('fills')
          .select(FILL_COLS)
          .order('executed_at', { ascending: true })
          .range(from, to),
      ),
  });
}

export function buildPositionView(
  row: PositionRow,
  fills: FillRow[],
  livePrice?: number | string | null,
  settings?: AppSettings,
): PositionView {
  try {
    return {
      row,
      fills,
      summary: summarize(row, fills, { livePrice, dust: dustOptions(settings) }),
      error: null,
    };
  } catch (e) {
    return { row, fills, summary: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/** All positions joined with their fills and engine summaries. `prices` is keyed by coingecko_id. */
export function usePortfolio(prices?: Record<string, number | undefined>) {
  const positions = usePositions();
  const fills = useFills();
  const settings = useSettings();

  const data = useMemo(() => {
    if (!positions.data || !fills.data) return undefined;
    const byPosition = new Map<string, FillRow[]>();
    for (const f of fills.data) {
      const list = byPosition.get(f.position_id);
      if (list) list.push(f);
      else byPosition.set(f.position_id, [f]);
    }
    return positions.data.map((row) =>
      buildPositionView(row, byPosition.get(row.id) ?? [], prices?.[row.coingecko_id], settings),
    );
  }, [positions.data, fills.data, prices, settings]);

  return {
    data,
    isLoading: positions.isLoading || fills.isLoading,
    error: positions.error ?? fills.error,
  };
}

// ---------- writes ----------

function invalidateTrades(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: tradeKeys.positions }),
    qc.invalidateQueries({ queryKey: tradeKeys.fills }),
  ]);
}

async function loadPosition(id: string): Promise<{ row: PositionRow; fills: FillRow[] }> {
  const [row, fills] = await Promise.all([
    supabase
      .from('positions')
      .select(POSITION_COLS)
      .eq('id', id)
      .single()
      .then(unwrap<PositionRow>),
    supabase
      .from('fills')
      .select(FILL_COLS)
      .eq('position_id', id)
      .order('executed_at')
      .then(unwrap<FillRow[]>),
  ]);
  return { row, fills };
}

/** Writes status / closed_at / opened_at derived by the engine, if they changed. */
async function syncPosition(row: PositionRow, fills: FillRow[]) {
  const patch = positionPatch(row, summarize(row, fills, { dust: dustOptions() }));
  if (patch) unwrap(await supabase.from('positions').update(patch).eq('id', row.id));
}

function asFillRow(row: PositionRow, draft: FillDraft, id: string): FillRow {
  return {
    ...draft,
    id,
    position_id: row.id,
    user_id: row.user_id,
    binance_trade_id: null,
    created_at: '',
    updated_at: '',
  };
}

export function useCreateTrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ position, fill }: { position: NewPositionDraft; fill: FillDraft }) => {
      const insert: Insert<PositionRow> = {
        ...position,
        status: 'open',
        opened_at: fill.executed_at,
        closed_at: null,
        closed_manually: false,
      };
      const { id } = unwrap<{ id: string }>(
        await supabase.from('positions').insert(insert).select('id').single(),
      );
      const { error } = await supabase.from('fills').insert({ ...fill, position_id: id });
      if (error) {
        await supabase.from('positions').delete().eq('id', id);
        throw new Error(error.message);
      }
      return id;
    },
    onSuccess: () => invalidateTrades(qc),
  });
}

/** Adds (no fillId) or edits a fill, after checking the whole position stays valid. */
export function useSaveFill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      positionId,
      fillId,
      draft,
    }: {
      positionId: string;
      fillId?: string;
      draft: FillDraft;
    }) => {
      const { row, fills } = await loadPosition(positionId);
      const next = fillId
        ? fills.map((f) => (f.id === fillId ? { ...f, ...draft } : f))
        : [...fills, asFillRow(row, draft, 'new')];
      summarize(row, next); // throws a readable error on oversell

      if (fillId) unwrap(await supabase.from('fills').update(draft).eq('id', fillId));
      else unwrap(await supabase.from('fills').insert({ ...draft, position_id: positionId }));
      await syncPosition(row, next);
    },
    onSettled: () => invalidateTrades(qc),
  });
}

export function useDeleteFill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ positionId, fillId }: { positionId: string; fillId: string }) => {
      const { row, fills } = await loadPosition(positionId);
      const next = fills.filter((f) => f.id !== fillId);
      summarize(row, next);
      unwrap(await supabase.from('fills').delete().eq('id', fillId));
      await syncPosition(row, next);
    },
    onSettled: () => invalidateTrades(qc),
  });
}

export function useUpdatePositionDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<PositionDetailsDraft> }) => {
      unwrap(await supabase.from('positions').update(patch).eq('id', id));
    },
    onSuccess: () => invalidateTrades(qc),
  });
}

/** Close by hand: any leftover quantity is written off at cost. */
export function useClosePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(
        await supabase
          .from('positions')
          .update({ status: 'closed', closed_at: new Date().toISOString(), closed_manually: true })
          .eq('id', id),
      );
    },
    onSuccess: () => invalidateTrades(qc),
  });
}

/** Undo a manual close; the engine then decides open/closed from the fills again. */
export function useReopenPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const reopened = { status: 'open' as const, closed_at: null, closed_manually: false };
      unwrap(await supabase.from('positions').update(reopened).eq('id', id));
      const { row, fills } = await loadPosition(id);
      await syncPosition(row, fills);
    },
    onSettled: () => invalidateTrades(qc),
  });
}

/**
 * Merges two open positions in the same coin: the newer one's fills move into the older one,
 * then the newer (now empty) position is deleted. Returns the id of the position kept.
 */
export function useMergePositions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ aId, bId }: { aId: string; bId: string }) => {
      const [a, b] = await Promise.all([loadPosition(aId), loadPosition(bId)]);
      const plan = planMerge(a.row, b.row);
      const [keep, other] = plan.keepId === a.row.id ? [a, b] : [b, a];
      const keepRow = { ...keep.row, ...plan.patch };
      const merged = [
        ...keep.fills,
        ...other.fills.map((f) => ({ ...f, position_id: keep.row.id })),
      ];
      summarize(keepRow, merged); // throws before anything is written if the result is invalid

      // Move fills first: if a later step fails, the other position is just left empty.
      unwrap(
        await supabase
          .from('fills')
          .update({ position_id: keep.row.id })
          .eq('position_id', other.row.id),
      );
      if (Object.keys(plan.patch).length > 0) {
        unwrap(await supabase.from('positions').update(plan.patch).eq('id', keep.row.id));
      }
      unwrap(await supabase.from('positions').delete().eq('id', other.row.id));
      await syncPosition(keepRow, merged);
      return keep.row.id;
    },
    onSettled: () => invalidateTrades(qc),
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('positions').delete().eq('id', id));
    },
    onSuccess: () => invalidateTrades(qc),
  });
}
