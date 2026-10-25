import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CoinGeckoError, fetchPrices } from '../lib/coingecko';
import { usePortfolio, usePositions } from './trades';

const PRICE_TTL = 60_000;
/** Prices older than this (or a failed refresh) get a "stale" badge. */
const STALE_AFTER = 3 * 60_000;

export type Prices = Record<string, number | undefined>;

export function usePrices(ids: readonly string[]) {
  const key = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const query = useQuery({
    queryKey: ['prices', key],
    meta: { silent: true },
    queryFn: ({ signal }) => fetchPrices(key, signal),
    enabled: key.length > 0,
    staleTime: PRICE_TTL,
    refetchInterval: PRICE_TTL,
    refetchOnWindowFocus: true,
    // Keep showing the last prices while a new coin set loads or a refresh fails.
    placeholderData: keepPreviousData,
    retry: (count, err) => !(err instanceof CoinGeckoError && err.status === 429) && count < 2,
  });
  const updatedAt = query.dataUpdatedAt || null;
  return {
    data: query.data as Prices | undefined,
    updatedAt,
    error: query.error,
    isFetching: query.isFetching,
    isStale:
      key.length > 0 &&
      (!!query.error || (updatedAt !== null && Date.now() - updatedAt > STALE_AFTER)),
    refetch: query.refetch,
  };
}

export type PriceState = ReturnType<typeof usePrices>;

/** Portfolio with live prices applied to every open position. */
export function useLivePortfolio() {
  const positions = usePositions();
  const ids = useMemo(
    () => (positions.data ?? []).filter((p) => p.status === 'open').map((p) => p.coingecko_id),
    [positions.data],
  );
  const prices = usePrices(ids);
  const portfolio = usePortfolio(prices.data);
  return { ...portfolio, prices };
}
