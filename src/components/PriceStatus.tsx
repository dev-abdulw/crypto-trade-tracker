import { format } from 'date-fns';
import type { PriceState } from '../data/prices';

export default function PriceStatus({ prices }: { prices: PriceState }) {
  if (!prices.updatedAt && !prices.error) {
    return prices.isFetching ? <span className="text-xs text-muted">Loading prices…</span> : null;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted">
      {prices.updatedAt && <span>Prices as of {format(prices.updatedAt, 'HH:mm')}</span>}
      {prices.isStale && (
        <span
          title={prices.error instanceof Error ? prices.error.message : 'Prices are out of date'}
          className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-400"
        >
          stale
        </span>
      )}
      <button
        type="button"
        onClick={() => prices.refetch()}
        disabled={prices.isFetching}
        className="hover:text-fg disabled:opacity-50"
        aria-label="Refresh prices"
      >
        {prices.isFetching ? '…' : '↻'}
      </button>
    </span>
  );
}
