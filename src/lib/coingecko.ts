// CoinGecko public API client. Prices are added in phase 5; search powers the coin picker.

const BASE = 'https://api.coingecko.com/api/v3';
const apiKey = import.meta.env.VITE_COINGECKO_API_KEY;

function url(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  // Query param instead of a header so the request stays "simple" (no CORS preflight).
  if (apiKey) q.set('x_cg_demo_api_key', apiKey);
  return `${BASE}${path}?${q}`;
}

export interface CoinSearchResult {
  id: string;
  symbol: string;
  name: string;
  thumb: string;
  market_cap_rank: number | null;
}

export async function searchCoins(
  query: string,
  signal?: AbortSignal,
): Promise<CoinSearchResult[]> {
  const res = await fetch(url('/search', { query }), { signal });
  if (!res.ok)
    throw new Error(
      res.status === 429
        ? 'CoinGecko rate limit — try again shortly'
        : `CoinGecko error ${res.status}`,
    );
  const json = (await res.json()) as { coins?: CoinSearchResult[] };
  return (json.coins ?? []).slice(0, 10);
}
