import { describe, expect, it } from 'vitest';
import {
  computeAccount,
  computePosition,
  OversellError,
  validateSell,
  type CapitalFlowInput,
} from '../src/lib/pnl';
import { at, buy, s, sell } from './helpers';

const SOL = { symbol: 'SOL' };

describe('1. single buy → single sell', () => {
  it('profit', () => {
    const p = computePosition([buy(1, 100, at(2026, 3, 1)), sell(1, 110, at(2026, 3, 2))], SOL);
    expect(s(p.realizedPnl)).toBe('10');
    expect(s(p.pnlPct)).toBe('0.1');
    expect(p.status).toBe('closed');
    expect(p.closedAt).toEqual(at(2026, 3, 2));
    expect(s(p.remainingQty)).toBe('0');
    expect(p.holdingTimeMs).toBe(24 * 3600 * 1000);
  });

  it('loss', () => {
    const p = computePosition([buy(1, 100, at(2026, 3, 1)), sell(1, 90, at(2026, 3, 2))], SOL);
    expect(s(p.realizedPnl)).toBe('-10');
    expect(s(p.pnlPct)).toBe('-0.1');
    expect(p.status).toBe('closed');
  });

  it('open position with live price has unrealized P&L only', () => {
    const p = computePosition([buy(2, 100, at(2026, 3, 1))], { ...SOL, livePrice: 120 });
    expect(p.status).toBe('open');
    expect(s(p.realizedPnl)).toBe('0');
    expect(s(p.openCost)).toBe('200');
    expect(s(p.unrealizedPnl)).toBe('40');
    expect(s(p.unrealizedPct)).toBe('0.2');
  });
});

describe('2. two buys at different prices → one full sell', () => {
  it('uses the average entry', () => {
    const p = computePosition(
      [buy(1, 100, at(2026, 3, 1)), buy(1, 200, at(2026, 3, 2)), sell(2, 180, at(2026, 3, 3))],
      SOL,
    );
    expect(s(p.avgEntry)).toBe('150');
    expect(s(p.totalCost)).toBe('300');
    expect(s(p.proceeds)).toBe('360');
    expect(s(p.realizedPnl)).toBe('60');
    expect(s(p.pnlPct)).toBe('0.2');
    expect(p.status).toBe('closed');
  });
});

describe('3. one buy → three partial sells across two months', () => {
  it('attributes realized P&L to each sell date', () => {
    const p = computePosition(
      [
        buy(3, 100, at(2026, 3, 10)),
        sell(1, 110, at(2026, 3, 20)),
        sell(1, 120, at(2026, 4, 2)),
        sell(1, 90, at(2026, 4, 15)),
      ],
      SOL,
    );
    expect(p.realizations.map((r) => s(r.realizedPnl))).toEqual(['10', '20', '-10']);
    expect(p.realizations.map((r) => r.at.getMonth() + 1)).toEqual([3, 4, 4]);
    expect(s(p.realizedPnl)).toBe('20');
    expect(p.closedAt).toEqual(at(2026, 4, 15));
  });
});

describe('4. buy → partial sell → buy again → sell rest', () => {
  it('keeps earlier realized P&L unchanged', () => {
    const fills = [
      buy(2, 100, at(2026, 3, 1)),
      sell(1, 120, at(2026, 3, 2)),
      buy(1, 130, at(2026, 3, 3)),
      sell(2, 140, at(2026, 3, 4)),
    ];
    const p = computePosition(fills, SOL);
    expect(p.realizations.map((r) => s(r.realizedPnl))).toEqual(['20', '50']);
    expect(p.timeline.map((t) => s(t.avgEntryAfter))).toEqual(['100', '100', '115', '115']);
    expect(p.timeline.map((t) => s(t.remainingQtyAfter))).toEqual(['2', '1', '2', '0']);
    expect(s(p.realizedPnl)).toBe('70');

    // Adding the later fills must not change the first sell's result.
    const early = computePosition(fills.slice(0, 2), SOL);
    expect(s(early.realizations[0]!.realizedPnl)).toBe('20');
  });

  it('sorts fills by time regardless of input order', () => {
    const p = computePosition([sell(1, 120, at(2026, 3, 2)), buy(1, 100, at(2026, 3, 1))], SOL);
    expect(s(p.realizedPnl)).toBe('20');
  });
});

describe('5. fees', () => {
  it('fee in USDT is added to cost and subtracted from proceeds', () => {
    const p = computePosition(
      [
        buy(1, 100, at(2026, 3, 1), { fee_amount: '0.1', fee_asset: 'USDT', fee_usdt: '0.1' }),
        sell(1, 110, at(2026, 3, 2), { fee_amount: '0.11', fee_asset: 'USDT', fee_usdt: '0.11' }),
      ],
      SOL,
    );
    expect(s(p.avgEntry)).toBe('100.1');
    expect(s(p.proceeds)).toBe('109.89');
    expect(s(p.realizedPnl)).toBe('9.79');
    expect(s(p.feesUsdt)).toBe('0.21');
  });

  it('fee in BNB leaves quantity unchanged and uses fee_usdt', () => {
    const p = computePosition(
      [
        buy(1, 100, at(2026, 3, 1), { fee_amount: '0.0002', fee_asset: 'BNB', fee_usdt: '0.12' }),
        sell(1, 110, at(2026, 3, 2), {
          fee_amount: '0.00018',
          fee_asset: 'BNB',
          fee_usdt: '0.108',
        }),
      ],
      SOL,
    );
    expect(s(p.totalBoughtQty)).toBe('1');
    expect(s(p.totalCost)).toBe('100.12');
    expect(s(p.realizedPnl)).toBe('9.772');
    expect(p.status).toBe('closed');
  });

  it('fee in the coin on a buy reduces received quantity (not double-counted in cost)', () => {
    const p = computePosition(
      [
        buy(10, 100, at(2026, 3, 1), { fee_amount: '0.01', fee_asset: 'SOL', fee_usdt: '1' }),
        sell('9.99', 110, at(2026, 3, 2), {
          fee_amount: '1.0989',
          fee_asset: 'USDT',
          fee_usdt: '1.0989',
        }),
      ],
      SOL,
    );
    expect(s(p.totalBoughtQty)).toBe('9.99');
    expect(s(p.totalCost)).toBe('1000');
    expect(s(p.overallAvgEntry, 8)).toBe('100.1001001');
    expect(s(p.realizedPnl)).toBe('97.8011');
    expect(s(p.remainingQty)).toBe('0');
    expect(p.status).toBe('closed');
    expect(s(p.feesUsdt)).toBe('2.0989');
  });

  it('selling the gross bought quantity after a coin fee is rejected', () => {
    expect(() =>
      computePosition(
        [
          buy(10, 100, at(2026, 3, 1), { fee_amount: '0.01', fee_asset: 'SOL', fee_usdt: '1' }),
          sell(10, 110, at(2026, 3, 2)),
        ],
        SOL,
      ),
    ).toThrow(OversellError);
  });
});

describe('6. dust', () => {
  it('auto-closes when the remainder is dust and writes it off', () => {
    const p = computePosition(
      [buy(1, 100, at(2026, 3, 1)), sell('0.9995', 110, at(2026, 3, 2))],
      SOL,
    );
    expect(p.status).toBe('closed');
    expect(p.closedAt).toEqual(at(2026, 3, 2));
    expect(s(p.writtenOffQty)).toBe('0.0005');
    expect(s(p.remainingQty)).toBe('0');
    expect(s(p.openCost)).toBe('0');
    // 9.995 from the sell, −0.05 written off
    expect(p.realizations.map((r) => r.kind)).toEqual(['sell', 'writeoff']);
    expect(s(p.realizedPnl)).toBe('9.945');
  });

  it('a real remainder keeps the position open', () => {
    const p = computePosition([buy(1, 100, at(2026, 3, 1)), sell('0.5', 110, at(2026, 3, 2))], SOL);
    expect(p.status).toBe('open');
    expect(s(p.remainingQty)).toBe('0.5');
    expect(s(p.realizedPnl)).toBe('5');
  });

  it('a small position with no sells is never auto-closed', () => {
    const p = computePosition([buy('0.001', 100, at(2026, 3, 1))], SOL);
    expect(p.status).toBe('open');
  });

  it('manual close writes off what is left', () => {
    const p = computePosition([buy(1, 100, at(2026, 3, 1)), sell('0.5', 110, at(2026, 3, 2))], {
      ...SOL,
      manualCloseAt: at(2026, 3, 5),
    });
    expect(p.status).toBe('closed');
    expect(p.closedAt).toEqual(at(2026, 3, 5));
    expect(s(p.realizedPnl)).toBe('-45');
  });
});

describe('7. sell larger than remaining', () => {
  const fills = [buy(1, 100, at(2026, 3, 1))];

  it('is rejected by the engine', () => {
    expect(() => computePosition([...fills, sell('1.5', 110, at(2026, 3, 2))], SOL)).toThrow(
      OversellError,
    );
  });

  it('is rejected when the sell is dated before the buy', () => {
    expect(() => computePosition([...fills, sell(1, 110, at(2026, 2, 28))], SOL)).toThrow(
      OversellError,
    );
  });

  it('validateSell returns a message for oversells and null for valid sells', () => {
    expect(validateSell(fills, sell('1.5', 110, at(2026, 3, 2)), SOL)).toMatch(/only hold 1/);
    expect(validateSell(fills, sell(1, 110, at(2026, 3, 2)), SOL)).toBeNull();
  });
});

describe('8. account: capital, cash, portfolio value', () => {
  const flows: CapitalFlowInput[] = [
    { type: 'deposit', amount_usdt: 1000, occurred_at: at(2026, 1, 5) },
    { type: 'deposit', amount_usdt: 500, occurred_at: at(2026, 2, 5) },
    { type: 'withdrawal', amount_usdt: 200, occurred_at: at(2026, 3, 5) },
  ];
  const closed = computePosition([buy(1, 100, at(2026, 3, 1)), sell(1, 150, at(2026, 3, 2))], {
    symbol: 'ETH',
  });
  const open = computePosition([buy(2, 200, at(2026, 3, 3))], { symbol: 'BNB', livePrice: 250 });

  it('computes every account-level number', () => {
    const a = computeAccount(flows, [closed, open]);
    expect(s(a.netInvested)).toBe('1300');
    expect(s(a.realizedTotal)).toBe('50');
    expect(s(a.capital)).toBe('1350');
    expect(s(a.cashUsdt)).toBe('950');
    expect(s(a.holdingsValue)).toBe('500');
    expect(s(a.unrealizedPnl)).toBe('100');
    expect(s(a.portfolioValue)).toBe('1450');
    expect(s(a.totalReturn)).toBe('150');
    expect(s(a.totalReturnPct, 8)).toBe('0.11538462');
    expect(a.missingPrices).toBe(0);
  });

  it('values open positions at cost when the live price is missing', () => {
    const noPrice = computePosition([buy(1, 300, at(2026, 3, 3))], { symbol: 'AVAX' });
    const a = computeAccount(flows, [closed, open, noPrice]);
    expect(a.missingPrices).toBe(1);
    expect(s(a.cashUsdt)).toBe('650');
    expect(s(a.portfolioValue)).toBe('1450');
  });

  it('handles no deposits without dividing by zero', () => {
    const a = computeAccount([], []);
    expect(a.totalReturnPct).toBeNull();
  });
});
