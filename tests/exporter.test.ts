import { describe, expect, it } from 'vitest';
import { BACKUP_APP, BACKUP_VERSION, parseBackup, toCsv } from '../src/lib/exporter';

describe('toCsv', () => {
  const cols = [
    { header: 'name', value: (r: { name: string; n: number | null }) => r.name },
    { header: 'n', value: (r: { name: string; n: number | null }) => r.n },
  ];

  it('quotes commas, quotes and newlines', () => {
    expect(
      toCsv(
        [
          { name: 'a,b', n: 1 },
          { name: 'say "hi"\nok', n: null },
        ],
        cols,
      ),
    ).toBe('name,n\r\n"a,b",1\r\n"say ""hi""\nok",\r\n');
  });

  it('defuses formula-like text but keeps negative numbers', () => {
    const out = toCsv(
      [
        { name: '=HYPERLINK("x")', n: -5 },
        { name: '-12.5', n: 0 },
      ],
      cols,
    );
    expect(out).toContain(`"'=HYPERLINK(""x"")",-5`);
    expect(out).toContain('-12.5,0');
  });
});

const P = '11111111-1111-4111-8111-111111111111';
const F = '22222222-2222-4222-8222-222222222222';

function backup(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exported_at: '2026-10-25T10:00:00Z',
    capital_flows: [],
    positions: [
      {
        id: P,
        symbol: 'SOL',
        coingecko_id: 'solana',
        status: 'open',
        opened_at: '2026-10-01T10:00:00Z',
      },
    ],
    fills: [
      {
        id: F,
        position_id: P,
        side: 'buy',
        quantity: '1',
        price_usdt: '100',
        executed_at: '2026-10-01T10:00:00Z',
      },
    ],
    month_snapshots: [],
    ...overrides,
  });
}

describe('parseBackup', () => {
  it('accepts a valid backup', () => {
    const b = parseBackup(backup());
    expect(b.positions).toHaveLength(1);
    expect(b.fills[0]?.position_id).toBe(P);
  });

  it('rejects non-JSON and other apps', () => {
    expect(() => parseBackup('nope')).toThrow(/Not a JSON file/);
    expect(() => parseBackup(backup({ app: 'other' }))).toThrow(/Not a valid backup/);
  });

  it('rejects fills pointing at a missing position', () => {
    expect(() => parseBackup(backup({ positions: [] }))).toThrow(/unknown position/);
  });
});
