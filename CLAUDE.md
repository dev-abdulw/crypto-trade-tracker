# CLAUDE.md

Personal crypto spot-trade tracker (Binance, USDT). The full spec and build order are in **PLAN.md**.
Read it first and work through its phases in order, committing after each phase.

## Rules
- Git identity is set in **local** repo config (`dev-abdulw` / `dev.abdul77@gmail.com`). Never modify
  the global git config; it holds the company identity.
- Remote must stay `git@github-personal:dev-abdulw/crypto-trade-tracker.git` (personal SSH key alias).
- `gh` CLI is not logged in. If you need it, ask the user to run `gh auth login` with the personal account.
- Never commit `.env.local` or any Supabase `service_role` key. Only the anon key goes in env/secrets.
- All P&L math lives in pure functions in `src/lib/` with Vitest tests. Use decimal math, not floats.
- Stop and ask the user at the steps listed in PLAN.md section 7 (GitHub repo, Supabase keys, secrets).

## Commands (once scaffolded)
- `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`
