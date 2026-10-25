import { z } from 'zod';

// Export / import formats: CSV for spreadsheets, JSON for full backups.

type Cell = string | number | boolean | null | undefined;

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Stop spreadsheets from treating text like "=SUM(...)" as a formula; numbers are left alone.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly { header: string; value: (row: T) => Cell }[],
): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return lines.join('\r\n') + '\r\n';
}

export const BACKUP_APP = 'crypto-trade-tracker';
export const BACKUP_VERSION = 1;

const numeric = z.union([z.string(), z.number()]);
const ts = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid timestamp');

const capitalFlow = z.object({
  id: z.string().uuid(),
  type: z.enum(['deposit', 'withdrawal']),
  amount_usdt: numeric,
  occurred_at: ts,
  note: z.string().nullable().optional(),
});

const position = z.object({
  id: z.string().uuid(),
  symbol: z.string().min(1),
  coingecko_id: z.string().min(1),
  status: z.enum(['open', 'closed']),
  style: z.enum(['day', 'swing']).nullable().optional(),
  setup: z.string().nullable().optional(),
  opened_at: ts,
  closed_at: ts.nullable().optional(),
  closed_manually: z.boolean().optional(),
  target_price: numeric.nullable().optional(),
  stop_price: numeric.nullable().optional(),
  notes: z.string().nullable().optional(),
});

const fill = z.object({
  id: z.string().uuid(),
  position_id: z.string().uuid(),
  side: z.enum(['buy', 'sell']),
  quantity: numeric,
  price_usdt: numeric,
  fee_amount: numeric.optional(),
  fee_asset: z.string().optional(),
  fee_usdt: numeric.optional(),
  executed_at: ts,
  binance_trade_id: z.string().nullable().optional(),
});

const balanceAdjustment = z.object({
  id: z.string().uuid(),
  amount_usdt: numeric,
  basis_usdt: numeric.nullable().optional(),
  occurred_at: ts,
  note: z.string().nullable().optional(),
});

const monthSnapshot = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  start_capital: numeric.nullable().optional(),
  end_capital: numeric.nullable().optional(),
  realized_pnl: numeric.nullable().optional(),
  unrealized_pnl_at_close: numeric.nullable().optional(),
  portfolio_value_at_close: numeric.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const backupSchema = z
  .object({
    app: z.literal(BACKUP_APP),
    version: z.literal(BACKUP_VERSION),
    exported_at: z.string(),
    capital_flows: z.array(capitalFlow),
    positions: z.array(position),
    fills: z.array(fill),
    month_snapshots: z.array(monthSnapshot),
    // Added after the first release; older backups simply have none.
    balance_adjustments: z.array(balanceAdjustment).default([]),
  })
  .superRefine((b, ctx) => {
    const ids = new Set(b.positions.map((p) => p.id));
    b.fills.forEach((f, i) => {
      if (!ids.has(f.position_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['fills', i, 'position_id'],
          message: 'unknown position',
        });
      }
    });
  });

/** Parsed backup: rows stripped to the columns the app writes (no user_id / timestamps). */
export type Backup = z.infer<typeof backupSchema>;

export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file');
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      `Not a valid backup: ${issue?.path.join('.') || 'file'} — ${issue?.message ?? 'invalid'}`,
    );
  }
  return result.data;
}
