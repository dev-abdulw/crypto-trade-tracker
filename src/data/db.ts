import type { PostgrestError } from '@supabase/supabase-js';

// Numeric columns are selected as text so values aren't rounded through JS floats.
export const POSITION_COLS =
  'id,user_id,symbol,coingecko_id,status,style,setup,opened_at,closed_at,closed_manually,' +
  'target_price::text,stop_price::text,notes,created_at,updated_at';

export const FILL_COLS =
  'id,user_id,position_id,side,quantity::text,price_usdt::text,fee_amount::text,fee_asset,' +
  'fee_usdt::text,executed_at,binance_trade_id,created_at,updated_at';

export const CAPITAL_FLOW_COLS =
  'id,user_id,type,amount_usdt::text,occurred_at,note,created_at,updated_at';

type Result = { data: unknown; error: PostgrestError | null };

export function unwrap<T>({ data, error }: Result): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const PAGE = 1000;

/** Reads every row, paging past PostgREST's default 1000-row limit. */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<Result>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const batch = unwrap<T[]>(await page(from, from + PAGE - 1));
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

export const ADJUSTMENT_COLS =
  'id,user_id,amount_usdt::text,basis_usdt::text,occurred_at,note,created_at,updated_at';

export const MEEZAN_COLS =
  'id,user_id,owner,fund,kind,amount_pkr::text,occurred_at,note,created_at,updated_at';
