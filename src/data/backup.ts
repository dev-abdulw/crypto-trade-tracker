import { supabase } from '../lib/supabase';
import { BACKUP_APP, BACKUP_VERSION, type Backup } from '../lib/exporter';
import type { CapitalFlowRow, FillRow, MonthSnapshotRow, PositionRow } from '../lib/types';
import { CAPITAL_FLOW_COLS, fetchAll, FILL_COLS, POSITION_COLS, unwrap } from './db';

const SNAPSHOT_COLS =
  'month,start_capital::text,end_capital::text,realized_pnl::text,unrealized_pnl_at_close::text,' +
  'portfolio_value_at_close::text,notes';

const strip = <T extends { user_id?: string; created_at?: string; updated_at?: string }>({
  user_id: _u,
  created_at: _c,
  updated_at: _m,
  ...rest
}: T) => rest;

export async function exportBackup() {
  const [capital_flows, positions, fills, month_snapshots] = await Promise.all([
    fetchAll<CapitalFlowRow>((f, t) =>
      supabase.from('capital_flows').select(CAPITAL_FLOW_COLS).order('occurred_at').range(f, t),
    ),
    fetchAll<PositionRow>((f, t) =>
      supabase.from('positions').select(POSITION_COLS).order('opened_at').range(f, t),
    ),
    fetchAll<FillRow>((f, t) =>
      supabase.from('fills').select(FILL_COLS).order('executed_at').range(f, t),
    ),
    fetchAll<Omit<MonthSnapshotRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>((f, t) =>
      supabase.from('month_snapshots').select(SNAPSHOT_COLS).order('month').range(f, t),
    ),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    capital_flows: capital_flows.map(strip),
    positions: positions.map(strip),
    fills: fills.map(strip),
    month_snapshots,
  };
}

/** Merges a backup into the signed-in account; rows with the same id are updated. */
export async function importBackup(b: Backup) {
  const chunks = <T>(rows: T[], size = 500) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
      rows.slice(i * size, (i + 1) * size),
    );

  for (const rows of chunks(b.capital_flows)) {
    unwrap(await supabase.from('capital_flows').upsert(rows, { onConflict: 'id' }));
  }
  for (const rows of chunks(b.positions)) {
    unwrap(await supabase.from('positions').upsert(rows, { onConflict: 'id' }));
  }
  for (const rows of chunks(b.fills)) {
    unwrap(await supabase.from('fills').upsert(rows, { onConflict: 'id' }));
  }
  for (const rows of chunks(b.month_snapshots)) {
    unwrap(await supabase.from('month_snapshots').upsert(rows, { onConflict: 'user_id,month' }));
  }
  return {
    capital_flows: b.capital_flows.length,
    positions: b.positions.length,
    fills: b.fills.length,
    month_snapshots: b.month_snapshots.length,
  };
}

export function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
