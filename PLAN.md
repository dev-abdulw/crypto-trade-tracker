# Crypto Trade Tracker — Implementation Plan

A personal web app to log **Binance spot trades (USDT pairs)**, track realized and unrealized
profit, see a **monthly summary** when each month ends, and record **capital deposits/withdrawals**.

Hosted on **GitHub Pages**, data in **Supabase** (Postgres + auth), live prices from **CoinGecko**.

---

## 0. Decisions already made (do not re-ask)

| Topic | Decision |
|---|---|
| Hosting | GitHub Pages, deployed by GitHub Actions |
| Data | Supabase (free tier): Postgres + Auth + Row Level Security |
| Prices | CoinGecko free public API (no key), cached ~60s |
| Exchange / quote | Binance, everything valued in **USDT** |
| Trade type | Spot only — no leverage, no shorts, no futures |
| Cost basis | **Per position**: each trade is a "position" opened by one or more buys and closed by one or more sells. Inside a position, cost uses the position's average entry price. |
| Git identity | Local repo config: `dev-abdulw` / `dev.abdul77@gmail.com` (already set) |
| Git remote | `git@github-personal:dev-abdulw/crypto-trade-tracker.git` (already set; uses the personal SSH key via the `github-personal` host alias in `~/.ssh/config`) |

---

## 1. Tech stack

- **Vite + React 18 + TypeScript** (strict mode)
- **Tailwind CSS** for styling, dark theme by default, mobile-first (trades are often logged from a phone)
- **React Router** with `HashRouter` (GitHub Pages has no SPA fallback; hash routes avoid 404s on refresh)
- **@supabase/supabase-js** for auth + data
- **TanStack Query** for fetching/caching (Supabase reads and CoinGecko prices)
- **Recharts** for charts
- **react-hook-form + zod** for forms and validation
- **date-fns** for month boundaries (use the browser's local time zone)
- **Vitest** for unit tests of the P&L math (this is the part that must be right)
- **decimal.js** (or integer math) for money/quantity calculations — never plain float arithmetic for totals

---

## 2. Core concepts and math

### 2.1 Entities

- **Capital flow** — a deposit or withdrawal of USDT into the trading account ("add new investment").
- **Position** — one trade idea in one coin, e.g. "SOL swing, 3–8 Mar". Status `open` or `closed`.
- **Fill** — one execution inside a position: `buy` or `sell`, quantity, price (USDT), fee, timestamp.
  A position can have several buys (scaling in) and several sells (scaling out / partial take-profit).

### 2.2 Fees (Binance specifics)

A fee can be paid in **USDT**, **BNB**, or **the coin itself**. Store `fee_amount` + `fee_asset`, and
also `fee_usdt` (the fee converted to USDT at the time; for BNB the user types the BNB price or the
app fetches it, for the coin itself use the fill price).

- Fee in the coin on a **buy** → the received quantity is reduced: `net_qty = qty - fee_amount`.
- Fee in USDT/BNB → quantity unchanged; `fee_usdt` is added to cost (buy) or subtracted from proceeds (sell).

### 2.3 Per-position calculations (pure functions in `src/lib/pnl.ts`)

For a position, using its fills in time order:

```
total_bought_qty   = Σ net_qty of buys
total_cost         = Σ (qty × price) of buys + Σ fee_usdt of buys
avg_entry          = total_cost / total_bought_qty            // fee-inclusive break-even price
sold_qty           = Σ qty of sells
proceeds           = Σ (qty × price) of sells − Σ fee_usdt of sells
cost_of_sold       = sold_qty × avg_entry
realized_pnl       = proceeds − cost_of_sold
remaining_qty      = total_bought_qty − sold_qty
open_cost          = remaining_qty × avg_entry
unrealized_pnl     = remaining_qty × live_price − open_cost
pnl_pct            = realized_pnl / cost_of_sold               (closed part)
holding_time       = last fill time − first fill time
```

- **Average entry is recomputed at each buy**: if buys happen after some sells, the realized P&L of
  earlier sells must stay unchanged. Implement it as a running calculation over fills in time order
  (running qty, running cost, running avg), and attribute each sell's realized P&L to that sell. Each
  sell then has its own realized P&L and a date, which is what the monthly reports need.
- A position is **auto-closed** when `remaining_qty` ≤ a dust threshold (e.g. worth < 1 USDT or
  < 0.1% of bought qty). The user can also close it by hand and mark the dust as written off.
- Validation: a sell can never exceed the current remaining quantity.

### 2.4 Account-level numbers

```
net_invested       = Σ deposits − Σ withdrawals
realized_total     = Σ realized_pnl of all sells
capital            = net_invested + realized_total
cash_usdt          = capital − Σ open_cost of open positions       // "free" USDT
portfolio_value    = cash_usdt + Σ remaining_qty × live_price
total_return       = portfolio_value − net_invested
total_return_pct   = total_return / net_invested
```

### 2.5 Monthly report

A month's P&L counts the **sells made in that month** (realized), even if the buy happened earlier.

For each month:
- Realized P&L (USDT) and % return. Use a time-weighted, Modified Dietz style figure:
  `return_pct = pnl / (start_capital + Σ weighted deposits/withdrawals in month)`, where each flow is
  weighted by the fraction of the month it was present. Also show the simple `pnl / start_capital`.
- Starting capital, ending capital, deposits and withdrawals in the month
- Number of positions closed, wins vs losses, win rate
- Average win, average loss, profit factor (`Σ wins / |Σ losses|`)
- Best trade, worst trade (by USDT and by %)
- Total fees paid
- P&L by coin (bar chart) and daily cumulative P&L curve for that month
- Day trades vs swing trades split (day trade = opened and closed on the same calendar day)
- Unrealized P&L at month end: only shown on the **current** month (from live prices). For past
  months, store a snapshot (see 3.4) so it does not change later.

"Whenever the month ends it shows me what I did": on the first open of the app in a new month, show a
**"Your October 2026 recap"** card at the top of the dashboard, linking to that month's report, until dismissed.

---

## 3. Database (Supabase)

All tables have `user_id uuid not null default auth.uid() references auth.users`, `created_at`,
`updated_at`, and **RLS enabled** with the policy `user_id = auth.uid()` for select/insert/update/delete.
Put the SQL in `supabase/migrations/0001_init.sql` so it can be pasted into the Supabase SQL editor.

### 3.1 `capital_flows`
| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| type | text check in ('deposit','withdrawal') | |
| amount_usdt | numeric(20,8) check > 0 | |
| occurred_at | timestamptz | |
| note | text null | |

### 3.2 `positions`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| symbol | text | e.g. `SOL` (always paired with USDT) |
| coingecko_id | text | e.g. `solana` (for live prices) |
| status | text check in ('open','closed') | |
| style | text check in ('day','swing') null | optional manual tag; also auto-derived |
| setup | text null | optional: breakout, dip-buy, news… |
| opened_at | timestamptz | first buy time |
| closed_at | timestamptz null | |
| target_price | numeric null | optional plan |
| stop_price | numeric null | optional plan |
| notes | text null | reasoning / lessons |

### 3.3 `fills`
| column | type | notes |
|---|---|---|
| id | uuid pk | |
| position_id | uuid fk → positions on delete cascade | |
| side | text check in ('buy','sell') | |
| quantity | numeric(30,12) check > 0 | |
| price_usdt | numeric(30,12) check > 0 | |
| fee_amount | numeric(30,12) default 0 | |
| fee_asset | text default 'USDT' | `USDT`, `BNB`, or the symbol |
| fee_usdt | numeric(20,8) default 0 | |
| executed_at | timestamptz | |
| binance_trade_id | text null unique-per-user | for CSV import de-duplication later |

Indexes: `fills(position_id, executed_at)`, `positions(user_id, status)`, `fills(user_id, executed_at)`.

### 3.4 `month_snapshots`
Frozen numbers for a finished month (written once, the first time the app runs after that month ends):
`month date (first day)`, `start_capital`, `end_capital`, `realized_pnl`, `unrealized_pnl_at_close`,
`portfolio_value_at_close`, `notes text` (personal month review), unique `(user_id, month)`.
Realized numbers are always recomputable from fills; the snapshot exists so unrealized/portfolio
value at the end of the month are kept, and to hold the user's monthly reflection notes.

### 3.5 Auth
- Email + password (or magic link) via Supabase Auth.
- After the owner creates their account, **disable new sign-ups** in Supabase (Auth → Settings) so
  nobody else can register. Document this in the README.
- The Supabase **anon key is public by design**; security comes from RLS. Never commit the
  `service_role` key.

---

## 4. Screens

1. **Login**: email/password form. All other routes are protected.
2. **Dashboard** (`/`)
   - KPI tiles: Portfolio value, Net invested, Total return (USDT and %), This month's realized P&L,
     Unrealized P&L, Free USDT
   - Equity curve: capital over time (deposits shown as markers so they aren't mistaken for profit)
   - Open positions table: coin, qty, avg entry, live price, unrealized P&L ($ / %), age, distance to
     target/stop
   - Last 5 closed trades
   - Month-recap card (see 2.5) when a new month starts
3. **Trades** (`/trades`): all positions with filters (open/closed, coin, month, day/swing, win/loss),
   sort, search. Each row shows realized P&L, %, holding time.
4. **New trade** (`/trades/new`): coin picker (CoinGecko search → stores `symbol` + `coingecko_id`,
   with a list of recently used coins), first buy fill (qty, price, fee, fee asset, time defaulting to
   now), optional target/stop/notes. Shortcut: enter **USDT amount spent** instead of qty and the app
   computes qty.
5. **Position detail** (`/trades/:id`): fill timeline, running avg entry, realized and unrealized
   P&L, buttons **Add buy**, **Sell** (with "sell 25% / 50% / 100%" quick buttons), edit/delete fill,
   close position, notes.
6. **Monthly** (`/months`): one row per month — P&L, %, trades, win rate, colored green/red; a
   12-month bar chart. Click → **Month detail** (`/months/2026-10`) with everything from 2.5 plus
   editable "month review" notes.
7. **Capital** (`/capital`): list of deposits/withdrawals, **Add investment** / **Withdraw** buttons,
   net invested over time.
8. **Settings** (`/settings`): export all data as JSON and CSV, import JSON backup, dust threshold,
   default fee asset (BNB/USDT), default fee rate (e.g. 0.1% / 0.075% with BNB) to pre-fill fees,
   sign out.

Mobile layout: bottom tab bar (Dashboard, Trades, +, Months, Capital); the "+" opens New trade.

---

## 5. Project structure

```
crypto-trade-tracker/
  .github/workflows/deploy.yml
  supabase/migrations/0001_init.sql
  src/
    main.tsx, App.tsx, routes.tsx
    lib/
      supabase.ts        # client from VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
      pnl.ts             # pure P&L math (2.3, 2.4)
      monthly.ts         # monthly aggregation (2.5)
      money.ts           # decimal helpers + formatting
      coingecko.ts       # price + search client with caching
      types.ts           # DB row types (generate with `supabase gen types` or hand-write)
    data/                # TanStack Query hooks: usePositions, useFills, useCapitalFlows, usePrices…
    components/          # KpiTile, PnlBadge, CoinPicker, FillForm, charts…
    pages/               # Dashboard, Trades, NewTrade, Position, Months, Month, Capital, Settings, Login
  tests/
    pnl.test.ts
    monthly.test.ts
  .env.example           # VITE_SUPABASE_URL=, VITE_SUPABASE_ANON_KEY=
  README.md
```

---

## 6. Build phases (do them in order; commit after each)

### Phase 1 — Scaffold
- `npm create vite@latest . -- --template react-ts`, add Tailwind, Router, TanStack Query, Supabase,
  Recharts, zod, react-hook-form, date-fns, decimal.js, Vitest.
- `vite.config.ts`: `base: '/crypto-trade-tracker/'`.
- ESLint + Prettier, `npm run typecheck`, `npm test`, `npm run build` scripts.
- **Done when:** `npm run dev` shows an empty app shell with the nav; build passes.

### Phase 2 — P&L engine (test-first)
- Implement `pnl.ts` and `monthly.ts` as pure functions over plain arrays (no Supabase dependency).
- Unit tests must cover at least:
  1. Single buy → single sell, profit and loss cases
  2. Two buys at different prices → one full sell (average entry)
  3. One buy → three partial sells across two different months (P&L lands in the right months)
  4. Buy → partial sell → buy again → sell rest (earlier realized P&L unchanged)
  5. Fee in USDT, fee in BNB, fee in the coin on a buy (reduced quantity)
  6. Dust remaining → auto-close
  7. Sell larger than remaining → rejected
  8. Capital, cash, portfolio value with deposits and a withdrawal
  9. Monthly return with a mid-month deposit (Modified Dietz)
  10. Win rate / profit factor / best / worst
- **Done when:** all tests pass.

### Phase 3 — Supabase + auth  *(needs the user — see section 7)*
- Write `0001_init.sql` (tables, constraints, indexes, RLS policies, `updated_at` trigger).
- Supabase client, login page, protected routes, session persistence.
- **Done when:** the user can log in locally and RLS blocks reading rows without a session.

### Phase 4 — Capital + trades CRUD
- Capital page (add/edit/delete deposits and withdrawals).
- New trade, position detail, add buy, sell, edit/delete fill, close position.
- Position `status`/`closed_at` are updated from the engine after every fill change.
- **Done when:** a full trade lifecycle can be logged and the numbers match the hand calculation.

### Phase 5 — Live prices
- `coingecko.ts`: `/api/v3/simple/price?ids=...&vs_currencies=usd` (USDT ≈ USD is fine for display) and
  `/api/v3/search?query=` for the coin picker. Batch all open coins into one request, cache 60s,
  refetch on window focus, show "prices as of hh:mm". Handle 429 rate limits gracefully (keep last
  prices, show stale badge). Optional: allow a CoinGecko demo API key via env.
- **Done when:** open positions show live unrealized P&L.

### Phase 6 — Dashboard + monthly reports
- KPI tiles, equity curve, open positions, recent trades, month list, month detail, charts,
  month-review notes, month snapshot writing, new-month recap card.
- **Done when:** with sample data spanning 3 months, every screen shows correct numbers.

### Phase 7 — Deploy to GitHub Pages  *(needs the user — see section 7)*
- `.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm test` → `npm run build` with
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from repo **secrets** → `actions/upload-pages-artifact`
  → `actions/deploy-pages`.
- In Supabase Auth → URL configuration, add `https://dev-abdulw.github.io/crypto-trade-tracker/` as site/redirect URL.
- **Done when:** the live URL works and login works there.

### Phase 8 — Polish
- Export/import JSON + CSV, settings, empty states, loading skeletons, error toasts, number
  formatting (USDT 2 decimals, quantities up to 8, prices adaptive for small coins).
- Optional PWA manifest so it can be added to the phone home screen.

### Later (not now)
- Binance **CSV import** of the trade history export (de-duplicate by `binance_trade_id`, group fills
  into positions by coin with a "review before saving" step).
- Read-only Binance API key sync.
- Tags/setups analytics (which setups make money), journaling screenshots.

---

## 7. Steps that need the user (Claude Code: stop and ask at these points)

1. **Create the GitHub repo** `crypto-trade-tracker` under `dev-abdulw`. The `gh` CLI is **not logged
   in** on this Mac, so either:
   - the user creates it on github.com (empty, no README), or
   - the user runs `gh auth login` with the **personal** account and Claude creates it with
     `gh repo create dev-abdulw/crypto-trade-tracker --public --source . --push`.

   Note: GitHub Pages on a **free** account only works for **public** repos. That is fine: the code
   is public, but all trade data lives in Supabase behind login + RLS. (A private repo would need GitHub Pro.)
2. **Create a Supabase project** (free tier) at supabase.com, then give Claude the **Project URL** and
   **anon public key** (put them in `.env.local`, which is git-ignored). Run `0001_init.sql` in the SQL
   editor (or Claude walks through it).
3. **Create the login user** (sign up once in the app), then **disable sign-ups** in Supabase.
4. **Add repo secrets** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (GitHub → Settings → Secrets
   and variables → Actions), and set **Settings → Pages → Source = GitHub Actions**.

---

## 8. Git rules for this repo

- Always push through the existing remote `git@github-personal:dev-abdulw/...` (personal SSH key).
  Never change it to `git@github.com:` (that would use the company key).
- Commit identity is set in local config (`dev-abdulw` / `dev.abdul77@gmail.com`); do not touch the
  global git config (it's the company identity).
- Small commits, one per phase or feature, with clear messages.
