import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Insert, MeezanEntryRow } from '../lib/types';
import { fetchAll, MEEZAN_COLS, unwrap } from './db';

export const meezanKeys = { all: ['meezan_entries'] as const };

export type MeezanEntryDraft = Insert<MeezanEntryRow>;

export function useMeezanEntries() {
  return useQuery({
    queryKey: meezanKeys.all,
    // A missing table (migration 0003 not run) is explained on the page instead of a toast.
    meta: { silent: true },
    retry: false,
    queryFn: () =>
      fetchAll<MeezanEntryRow>((from, to) =>
        supabase
          .from('meezan_entries')
          .select(MEEZAN_COLS)
          .order('occurred_at', { ascending: true })
          .range(from, to),
      ),
  });
}

export function useSaveMeezanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: MeezanEntryDraft }) => {
      const query = id
        ? supabase.from('meezan_entries').update(draft).eq('id', id)
        : supabase.from('meezan_entries').insert(draft);
      unwrap(await query);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: meezanKeys.all }),
  });
}

export function useDeleteMeezanEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      unwrap(await supabase.from('meezan_entries').delete().eq('id', id));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: meezanKeys.all }),
  });
}
