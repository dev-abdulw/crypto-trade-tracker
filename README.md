# Crypto Trade Tracker

A personal web app for logging **Binance spot trades (USDT pairs)**: realized and unrealized P&L,
monthly reports, and capital deposits/withdrawals.

- Hosting: GitHub Pages (built by GitHub Actions)
- Data and login: Supabase (Postgres + Auth + Row Level Security)
- Prices: CoinGecko public API

Live: https://dev-abdulw.github.io/crypto-trade-tracker/

## How the numbers work

- A **position** is one trade idea in one coin, built from one or more buy and sell **fills**.
- Cost basis is the position's running, fee-inclusive **average entry**. Each sell's realized P&L
  is fixed when it happens; later buys don't change it.
- Fees can be in USDT, BNB or the coin itself. A coin-paid buy fee reduces the quantity you
  receive (it is not also added to cost).
- A position closes automatically when what's left is dust (worth < 1 USDT, or < 0.1% of what
  was bought). Closing by hand writes off what's left.
- A month's P&L counts the **sells made that month**. The month return is time-weighted
  (Modified Dietz), so a mid-month deposit doesn't inflate it; the simple `pnl / start capital`
  is shown too.
- After a month ends, the app saves that month's unrealized P&L and portfolio value once, at
  CoinGecko's month-close price, so it doesn't change later.

All of this is plain TypeScript in `src/lib/` with Vitest tests in `tests/`.

## Local development

```sh
npm install
cp .env.example .env.local   # then fill in the two Supabase values
npm run dev                  # http://localhost:5173/crypto-trade-tracker/
npm test
npm run typecheck
npm run build
```

`.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
VITE_COINGECKO_API_KEY=        # optional demo key, for higher rate limits
```

The anon (publishable) key is public by design: Row Level Security keeps each user to their own
rows. **Never** put the `service_role` / secret key in this repo or in the app.

## One-time setup

### Supabase

1. Create a project at supabase.com (free tier).
2. SQL Editor → paste `supabase/migrations/0001_init.sql` → Run.
3. Start the app, choose **Create the owner account**, and sign in.
4. **Turn off new sign-ups** so nobody else can register: Authentication → Sign In / Providers →
   disable **Allow new users to sign up**.
5. Authentication → URL Configuration: set the Site URL and add a redirect URL of
   `https://dev-abdulw.github.io/crypto-trade-tracker/`.

### GitHub Pages

1. Repo → Settings → Secrets and variables → Actions → add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (optionally `VITE_COINGECKO_API_KEY`).
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Push to `main`. The workflow typechecks, tests, builds and deploys.

GitHub Pages on a free account needs a **public** repo. The code is public; the trade data lives
in Supabase behind login and RLS.

## Backups

Settings → **Export JSON** downloads everything (capital, positions, fills, month reviews).
**Import JSON** merges a backup back in (rows with the same id are updated, not duplicated).
CSV exports of fills and capital flows are available for spreadsheets.
