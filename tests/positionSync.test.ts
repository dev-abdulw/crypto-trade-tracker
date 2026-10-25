import { describe, expect, it } from 'vitest';
import {
  InvalidFillsError,
  positionPatch,
  summarize,
  type PositionState,
} from '../src/lib/positionSync';
import { at, buy, sell } from './helpers';

const openRow: PositionState = {
  symbol: 'SOL',
  status: 'open',
  opened_at: at(2026, 3, 1).toISOString(),
  closed_at: null,
  closed_manually: false,
};

describe('positionPatch', () => {
  it('is null when the row already matches the fills', () => {
    const s = summarize(openRow, [buy(1, 100, at(2026, 3, 1))]);
    expect(positionPatch(openRow, s)).toBeNull();
  });

  it('closes the row when the last sell empties it', () => {
    const s = summarize(openRow, [buy(1, 100, at(2026, 3, 1)), sell(1, 110, at(2026, 3, 4))]);
    expect(positionPatch(openRow, s)).toEqual({
      status: 'closed',
      closed_at: at(2026, 3, 4).toISOString(),
      opened_at: at(2026, 3, 1).toISOString(),
    });
  });

  it('reopens a row when a sell is removed', () => {
    const closedRow: PositionState = {
      ...openRow,
      status: 'closed',
      closed_at: at(2026, 3, 4).toISOString(),
    };
    const s = summarize(closedRow, [buy(1, 100, at(2026, 3, 1))]);
    expect(positionPatch(closedRow, s)).toEqual({
      status: 'open',
      closed_at: null,
      opened_at: at(2026, 3, 1).toISOString(),
    });
  });

  it('moves opened_at when the first buy is edited to an earlier time', () => {
    const s = summarize(openRow, [buy(1, 100, at(2026, 2, 27))]);
    expect(positionPatch(openRow, s)?.opened_at).toBe(at(2026, 2, 27).toISOString());
  });

  it('keeps a manually closed row closed at its manual time', () => {
    const manual: PositionState = {
      ...openRow,
      status: 'closed',
      closed_at: at(2026, 3, 9).toISOString(),
      closed_manually: true,
    };
    const s = summarize(manual, [buy(1, 100, at(2026, 3, 1)), sell('0.5', 110, at(2026, 3, 2))]);
    expect(s.status).toBe('closed');
    expect(s.writtenOffQty.toFixed()).toBe('0.5');
    expect(positionPatch(manual, s)).toBeNull();
  });
});

describe('summarize', () => {
  it('turns an oversell into a readable error', () => {
    expect(() =>
      summarize(openRow, [buy(1, 100, at(2026, 3, 1)), sell(2, 110, at(2026, 3, 2))]),
    ).toThrow(InvalidFillsError);
  });

  it('rejects deleting a buy that later sells depend on', () => {
    const fills = [
      buy(1, 100, at(2026, 3, 1)),
      buy(1, 100, at(2026, 3, 2)),
      sell(2, 110, at(2026, 3, 3)),
    ];
    expect(() =>
      summarize(
        openRow,
        fills.filter((_, i) => i !== 1),
      ),
    ).toThrow(/holding 1, selling 2/);
  });
});
