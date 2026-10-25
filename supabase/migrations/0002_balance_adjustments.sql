-- Balance adjustments: manual corrections so the app's portfolio value matches the real
-- Binance balance (missed fees, rounding, a mis-logged trade). Unlike deposits/withdrawals they
-- count as profit (+) or loss (−).
-- Paste into Supabase → SQL Editor and run once (after 0001_init.sql).

create table public.balance_adjustments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- signed: + gain, − loss
  amount_usdt  numeric(20, 8) not null check (amount_usdt <> 0),
  -- portfolio value just before the adjustment, so its % can be shown
  basis_usdt   numeric(20, 8) check (basis_usdt > 0),
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index balance_adjustments_user_occurred_idx
  on public.balance_adjustments (user_id, occurred_at);

create trigger balance_adjustments_updated_at before update on public.balance_adjustments
  for each row execute function public.set_updated_at();

alter table public.balance_adjustments enable row level security;

create policy "own rows" on public.balance_adjustments for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.balance_adjustments from anon;
grant select, insert, update, delete on public.balance_adjustments to authenticated;
