import { describe, expect, it } from 'vitest';
import { estimateFee, feeToUsdt, parseDecimal, qtyFromAmount } from '../src/lib/fillMath';

describe('parseDecimal', () => {
  it('accepts plain and comma-grouped numbers', () => {
    expect(parseDecimal('0.01')?.toFixed()).toBe('0.01');
    expect(parseDecimal('1,234.5')?.toFixed()).toBe('1234.5');
    expect(parseDecimal('.5')?.toFixed()).toBe('0.5');
  });
  it('rejects junk', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
    expect(parseDecimal('1e5')).toBeNull();
  });
});

describe('qtyFromAmount', () => {
  it('divides and rounds down to 12 dp', () => {
    expect(qtyFromAmount(100, 3).toFixed()).toBe('33.333333333333');
    expect(qtyFromAmount(500, 125).toFixed()).toBe('4');
  });
});

describe('feeToUsdt', () => {
  const base = { symbol: 'SOL', price: 150 };
  it('USDT fee is taken as is', () => {
    expect(feeToUsdt({ ...base, feeAmount: '0.15', feeAsset: 'USDT' })?.toFixed()).toBe('0.15');
  });
  it('coin fee is valued at the fill price', () => {
    expect(feeToUsdt({ ...base, feeAmount: '0.001', feeAsset: 'SOL' })?.toFixed()).toBe('0.15');
  });
  it('BNB fee needs a BNB price', () => {
    expect(feeToUsdt({ ...base, feeAmount: '0.0002', feeAsset: 'BNB' })).toBeNull();
    expect(
      feeToUsdt({ ...base, feeAmount: '0.0002', feeAsset: 'BNB', bnbPrice: 600 })?.toFixed(),
    ).toBe('0.12');
  });
  it('zero fee is zero regardless of asset', () => {
    expect(feeToUsdt({ ...base, feeAmount: 0, feeAsset: 'BNB' })?.toFixed()).toBe('0');
  });
});

describe('estimateFee', () => {
  const base = { qty: 2, price: 100, symbol: 'SOL', ratePct: '0.1' };
  it('estimates in USDT, the coin, or BNB', () => {
    expect(estimateFee({ ...base, feeAsset: 'USDT' })?.toFixed()).toBe('0.2');
    expect(estimateFee({ ...base, feeAsset: 'SOL' })?.toFixed()).toBe('0.002');
    expect(
      estimateFee({ ...base, feeAsset: 'BNB', ratePct: '0.075', bnbPrice: 600 })?.toFixed(),
    ).toBe('0.00025');
    expect(estimateFee({ ...base, feeAsset: 'BNB' })).toBeNull();
  });
});
