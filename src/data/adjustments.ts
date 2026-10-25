import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { BalanceAdjustmentRow, Insert } from '../lib/types';
import { ADJUSTMENT_COLS, fetchAll, unwrap } from './db';

export const adjustmentKeys = { all: ['balance_adjustments'] as const };

export type AdjustmentDraft = Insert<BalanceAdjustmentRow>;

export function useAdjustments() {
  return useQuery({
    queryKey: adjustmentKeys.all,
    // Missing-table errors are shown on the Capital page instead of as a toast.
    meta: { silent: true },
    retry: false,
    queryFn: () =>
      fetchAll<BalanceAdjustmentRow>((from, to) =>
        supabase
          .from('balance_adjustments')
          .select(ADJUSTMENT_COLS)
          .order('occurred_at', { ascending: true })
          .range(from, to),
      ),
  });
}

export function useSaveAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: Partial<AdjustmentDraft> }) => {
      const query = id
        ? supabase.from('balance_adjustments').update(draft).eq('id', id)
        : supabase.from('balance_adjustments').insert(draft);
      unwrap(await query);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adjustmentKeys.all }),
  });
}

export function useDeleteAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('balance_adjustments').delete().eq('id', id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: adjustmentKeys.all }),
  });
}
