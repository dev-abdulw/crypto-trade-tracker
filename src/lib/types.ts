// Row types for the Supabase tables (supabase/migrations/0001_init.sql).
// Postgres numerics arrive as strings or numbers; always wrap them with d() before math.

type Numeric = string | number;

interface Timestamps {
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface CapitalFlowRow extends Timestamps {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount_usdt: Numeric;
  occurred_at: string;
  note: string | null;
}

export interface PositionRow extends Timestamps {
  id: string;
  symbol: string;
  coingecko_id: string;
  status: 'open' | 'closed';
  style: 'day' | 'swing' | null;
  setup: string | null;
  opened_at: string;
  closed_at: string | null;
  closed_manually: boolean;
  target_price: Numeric | null;
  stop_price: Numeric | null;
  notes: string | null;
}

export interface FillRow extends Timestamps {
  id: string;
  position_id: string;
  side: 'buy' | 'sell';
  quantity: Numeric;
  price_usdt: Numeric;
  fee_amount: Numeric;
  fee_asset: string;
  fee_usdt: Numeric;
  executed_at: string;
  binance_trade_id: string | null;
}

export interface MonthSnapshotRow extends Timestamps {
  id: string;
  month: string; // yyyy-MM-01
  start_capital: Numeric | null;
  end_capital: Numeric | null;
  realized_pnl: Numeric | null;
  unrealized_pnl_at_close: Numeric | null;
  portfolio_value_at_close: Numeric | null;
  notes: string | null;
}

/** Columns the client sends on insert (user_id/id/timestamps come from DB defaults). */
export type Insert<T> = Omit<T, 'id' | 'user_id' | 'created_at' | 'updated_at'>;

export interface BalanceAdjustmentRow extends Timestamps {
  id: string;
  /** Signed: + gain, − loss. */
  amount_usdt: Numeric;
  /** Portfolio value just before the adjustment (for its %). */
  basis_usdt: Numeric | null;
  occurred_at: string;
  note: string | null;
}

export interface MeezanEntryRow extends Timestamps {
  id: string;
  owner: string;
  fund: 'AMMF' | 'MIACF';
  kind: 'deposit' | 'withdrawal' | 'valuation';
  amount_pkr: Numeric;
  occurred_at: string;
  note: string | null;
}
