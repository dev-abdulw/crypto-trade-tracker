-- Al Meezan mutual fund tracking (PKR), separate from the crypto portfolio.
-- One row per event: money in (deposit), money out (withdrawal), or the balance read from the
-- Al Meezan app (valuation). Profit and rates are derived from these in the app.
-- Paste into Supabase → SQL Editor and run once (after 0002).

create table public.meezan_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- family member the money belongs to, e.g. 'me', 'junaid', 'usama', 'dad'
  owner        text not null check (length(owner) between 1 and 40),
  fund         text not null check (fund in ('AMMF', 'MIACF')),
  kind         text not null check (kind in ('deposit', 'withdrawal', 'valuation')),
  amount_pkr   numeric(20, 2) not null check (amount_pkr > 0),
  occurred_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index meezan_entries_user_holding_idx
  on public.meezan_entries (user_id, owner, fund, occurred_at);

create trigger meezan_entries_updated_at before update on public.meezan_entries
  for each row execute function public.set_updated_at();

alter table public.meezan_entries enable row level security;

create policy "own rows" on public.meezan_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.meezan_entries from anon;
grant select, insert, update, delete on public.meezan_entries to authenticated;
