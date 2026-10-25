-- Crypto Trade Tracker — initial schema.
-- Paste into Supabase → SQL Editor and run once.
-- Every table is private to its owner via Row Level Security (user_id = auth.uid()).

-- ---------- helpers ----------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- capital_flows ----------

create table public.capital_flows (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type         text not null check (type in ('deposit', 'withdrawal')),
  amount_usdt  numeric(20, 8) not null check (amount_usdt > 0),
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index capital_flows_user_occurred_idx on public.capital_flows (user_id, occurred_at);

-- ---------- positions ----------

create table public.positions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol           text not null check (symbol = upper(symbol) and length(symbol) between 1 and 20),
  coingecko_id     text not null,
  status           text not null default 'open' check (status in ('open', 'closed')),
  style            text check (style in ('day', 'swing')),
  setup            text,
  opened_at        timestamptz not null,
  closed_at        timestamptz,
  -- true when the user closed it by hand (leftover qty written off); false = closed by the engine
  closed_manually  boolean not null default false,
  target_price     numeric(30, 12) check (target_price > 0),
  stop_price       numeric(30, 12) check (stop_price > 0),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'closed') = (closed_at is not null))
);

create index positions_user_status_idx on public.positions (user_id, status);

-- ---------- fills ----------

create table public.fills (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position_id       uuid not null references public.positions (id) on delete cascade,
  side              text not null check (side in ('buy', 'sell')),
  quantity          numeric(30, 12) not null check (quantity > 0),
  price_usdt        numeric(30, 12) not null check (price_usdt > 0),
  fee_amount        numeric(30, 12) not null default 0 check (fee_amount >= 0),
  fee_asset         text not null default 'USDT',
  fee_usdt          numeric(20, 8) not null default 0 check (fee_usdt >= 0),
  executed_at       timestamptz not null default now(),
  binance_trade_id  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, binance_trade_id)
);

create index fills_position_executed_idx on public.fills (position_id, executed_at);
create index fills_user_executed_idx on public.fills (user_id, executed_at);

-- ---------- month_snapshots ----------

create table public.month_snapshots (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  month                     date not null check (extract(day from month) = 1),
  start_capital             numeric(20, 8),
  end_capital               numeric(20, 8),
  realized_pnl              numeric(20, 8),
  unrealized_pnl_at_close   numeric(20, 8),
  portfolio_value_at_close  numeric(20, 8),
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (user_id, month)
);

-- ---------- updated_at triggers ----------

create trigger capital_flows_updated_at before update on public.capital_flows
  for each row execute function public.set_updated_at();
create trigger positions_updated_at before update on public.positions
  for each row execute function public.set_updated_at();
create trigger fills_updated_at before update on public.fills
  for each row execute function public.set_updated_at();
create trigger month_snapshots_updated_at before update on public.month_snapshots
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------

alter table public.capital_flows   enable row level security;
alter table public.positions       enable row level security;
alter table public.fills           enable row level security;
alter table public.month_snapshots enable row level security;

create policy "own rows" on public.capital_flows for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own rows" on public.positions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A fill may only point at a position owned by the same user.
create policy "own rows" on public.fills for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.positions p
      where p.id = position_id and p.user_id = (select auth.uid())
    )
  );

create policy "own rows" on public.month_snapshots for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Signed-out (anon) requests get nothing; signed-in users get only their rows via RLS.
revoke all on public.capital_flows, public.positions, public.fills, public.month_snapshots from anon;
grant select, insert, update, delete
  on public.capital_flows, public.positions, public.fills, public.month_snapshots
  to authenticated;
