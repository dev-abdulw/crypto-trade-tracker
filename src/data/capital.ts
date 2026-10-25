import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { CapitalFlowRow, Insert } from '../lib/types';
import { CAPITAL_FLOW_COLS, fetchAll, unwrap } from './db';

export const capitalKeys = { all: ['capital_flows'] as const };

export type CapitalFlowDraft = Insert<CapitalFlowRow>;

export function useCapitalFlows() {
  return useQuery({
    queryKey: capitalKeys.all,
    queryFn: () =>
      fetchAll<CapitalFlowRow>((from, to) =>
        supabase
          .from('capital_flows')
          .select(CAPITAL_FLOW_COLS)
          .order('occurred_at', { ascending: true })
          .range(from, to),
      ),
  });
}

export function useSaveCapitalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: CapitalFlowDraft }) => {
      const query = id
        ? supabase.from('capital_flows').update(draft).eq('id', id)
        : supabase.from('capital_flows').insert(draft);
      unwrap(await query);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: capitalKeys.all }),
  });
}

export function useDeleteCapitalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('capital_flows').delete().eq('id', id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: capitalKeys.all }),
  });
}
