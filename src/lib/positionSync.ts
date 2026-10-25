import {
  computePosition,
  OversellError,
  type DustOptions,
  type FillInput,
  type PositionSummary,
} from './pnl';

// Bridges stored position rows and the P&L engine: which fills/close flags go in, and which
// status / closed_at / opened_at the row should have afterwards.

export interface PositionState {
  symbol: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  closed_manually: boolean;
}

export type PositionPatch = Pick<PositionState, 'status' | 'opened_at' | 'closed_at'>;

export class InvalidFillsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFillsError';
  }
}

export function summarize(
  row: PositionState,
  fills: readonly FillInput[],
  opts: { livePrice?: string | number | null; dust?: DustOptions } = {},
): PositionSummary {
  try {
    return computePosition(fills, {
      symbol: row.symbol,
      livePrice: opts.livePrice,
      dust: opts.dust,
      manualCloseAt: row.closed_manually ? row.closed_at : null,
    });
  } catch (e) {
    if (e instanceof OversellError) {
      throw new InvalidFillsError(
        `This would sell more ${row.symbol} than the position holds at that time ` +
          `(holding ${e.available.toFixed()}, selling ${e.requested.toFixed()}).`,
      );
    }
    throw e;
  }
}

/** The column values the row should have for these fills, or null if it is already up to date. */
export function positionPatch(row: PositionState, summary: PositionSummary): PositionPatch | null {
  const patch: PositionPatch = {
    status: summary.status,
    closed_at: summary.closedAt?.toISOString() ?? null,
    opened_at: summary.firstFillAt?.toISOString() ?? row.opened_at,
  };
  const same =
    patch.status === row.status &&
    sameInstant(patch.closed_at, row.closed_at) &&
    sameInstant(patch.opened_at, row.opened_at);
  return same ? null : patch;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}
