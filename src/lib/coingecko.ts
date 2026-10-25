// CoinGecko public API client: live prices, historical prices and coin search.
// USDT is treated as ≈ USD, which is fine for display.

const BASE = 'https://api.coingecko.com/api/v3';
const apiKey = import.meta.env.VITE_COINGECKO_API_KEY;

export const BNB_ID = 'binancecoin';

function url(path: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  // Query param instead of a header so the request stays "simple" (no CORS preflight).
  if (apiKey) q.set('x_cg_demo_api_key', apiKey);
  return `${BASE}${path}?${q}`;
}

export class CoinGeckoError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 429 ? 'CoinGecko rate limit — try again shortly' : `CoinGecko error ${status}`,
    );
    this.name = 'CoinGeckoError';
  }
}

async function get<T>(path: string, params: Record<string, string>, signal?: AbortSignal) {
  const res = await fetch(url(path, params), { signal });
  if (!res.ok) throw new CoinGeckoError(res.status);
  return (await res.json()) as T;
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
  const json = await get<{ coins?: CoinSearchResult[] }>('/search', { query }, signal);
  return (json.coins ?? []).slice(0, 10);
}

/** Live USD prices for many coins in one request, keyed by CoinGecko id. */
export async function fetchPrices(
  ids: readonly string[],
  signal?: AbortSignal,
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const json = await get<Record<string, { usd?: number }>>(
    '/simple/price',
    { ids: ids.join(','), vs_currencies: 'usd' },
    signal,
  );
  const prices: Record<string, number> = {};
  for (const id of ids) {
    const usd = json[id]?.usd;
    if (typeof usd === 'number') prices[id] = usd;
  }
  return prices;
}

/** Price at 00:00 UTC on `date` (CoinGecko daily snapshot), or null if unknown. */
export async function fetchHistoricalPrice(id: string, date: Date): Promise<number | null> {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const json = await get<{ market_data?: { current_price?: { usd?: number } } }>(
    `/coins/${encodeURIComponent(id)}/history`,
    { date: `${dd}-${mm}-${date.getUTCFullYear()}`, localization: 'false' },
  );
  return json.market_data?.current_price?.usd ?? null;
}
