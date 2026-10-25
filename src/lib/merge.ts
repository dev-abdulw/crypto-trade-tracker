// Merging two open positions in the same coin into one (fills move to the older position).

export interface MergeablePosition {
  id: string;
  symbol: string;
  coingecko_id: string;
  status: 'open' | 'closed';
  opened_at: string;
  style: 'day' | 'swing' | null;
  setup: string | null;
  target_price: string | number | null;
  stop_price: string | number | null;
  notes: string | null;
}

export type MergePatch = Partial<
  Pick<MergeablePosition, 'style' | 'setup' | 'target_price' | 'stop_price' | 'notes'>
>;

export interface MergePlan {
  keepId: string;
  removeId: string;
  /** Plan/notes changes for the kept position (empty when nothing changes). */
  patch: MergePatch;
}

export function canMerge(a: MergeablePosition, b: MergeablePosition): boolean {
  return (
    a.id !== b.id && a.coingecko_id === b.coingecko_id && a.status === 'open' && b.status === 'open'
  );
}

/** Keeps the older position; fills in plan fields it lacks from the other and joins notes. */
export function planMerge(a: MergeablePosition, b: MergeablePosition): MergePlan {
  if (!canMerge(a, b)) throw new Error('Only two open positions in the same coin can be merged.');
  const [keep, other] = new Date(a.opened_at) <= new Date(b.opened_at) ? [a, b] : [b, a];

  const patch: MergePatch = {};
  for (const k of ['style', 'setup', 'target_price', 'stop_price'] as const) {
    if (keep[k] === null && other[k] !== null) Object.assign(patch, { [k]: other[k] });
  }
  if (other.notes?.trim()) {
    patch.notes = keep.notes?.trim()
      ? `${keep.notes.trim()}\n\n${other.notes.trim()}`
      : other.notes;
  }
  return { keepId: keep.id, removeId: other.id, patch };
}
