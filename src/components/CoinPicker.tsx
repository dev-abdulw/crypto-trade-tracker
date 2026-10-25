import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { searchCoins } from '../lib/coingecko';
import { getRecentCoins, type RecentCoin } from '../lib/settings';
import { inputClass } from './ui';

export type PickedCoin = RecentCoin;

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function CoinPicker({
  value,
  onChange,
}: {
  value: PickedCoin | null;
  onChange: (coin: PickedCoin | null) => void;
}) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 300);
  const recent = getRecentCoins();
  const search = useQuery({
    queryKey: ['coin-search', q],
    queryFn: ({ signal }) => searchCoins(q, signal),
    enabled: q.length >= 2,
    staleTime: 10 * 60_000,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          {value.thumb && <img src={value.thumb} alt="" className="w-5 h-5 rounded-full" />}
          <span className="font-medium">{value.symbol}</span>
          <span className="text-sm text-muted">{value.name} · /USDT</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted hover:text-fg"
        >
          Change
        </button>
      </div>
    );
  }

  const pick = (coin: PickedCoin) => {
    onChange(coin);
    setQuery('');
  };

  return (
    <div className="space-y-2">
      <input
        autoFocus
        placeholder="Search coin (e.g. SOL, Solana)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClass}
      />
      {recent.length > 0 && q.length < 2 && (
        <div className="flex flex-wrap gap-2">
          {recent.map((c) => (
            <button
              key={c.coingecko_id}
              type="button"
              onClick={() => pick(c)}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs hover:bg-surface"
            >
              {c.thumb && <img src={c.thumb} alt="" className="w-4 h-4 rounded-full" />}
              {c.symbol}
            </button>
          ))}
        </div>
      )}
      {q.length >= 2 && (
        <ul className="rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto">
          {search.isLoading && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {search.error && <li className="px-3 py-2 text-sm text-loss">{search.error.message}</li>}
          {search.data?.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No coins found</li>
          )}
          {search.data?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() =>
                  pick({
                    symbol: c.symbol.toUpperCase(),
                    coingecko_id: c.id,
                    name: c.name,
                    thumb: c.thumb,
                  })
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface"
              >
                <img src={c.thumb} alt="" className="w-5 h-5 rounded-full" />
                <span className="font-medium">{c.symbol.toUpperCase()}</span>
                <span className="text-sm text-muted truncate">{c.name}</span>
                {c.market_cap_rank && (
                  <span className="ml-auto text-xs text-muted">#{c.market_cap_rank}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
