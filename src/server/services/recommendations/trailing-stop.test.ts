import { describe, it, expect } from 'vitest';
import { computeTrailingStop } from './trailing-stop';

describe('computeTrailingStop', () => {
  it('returns original stop loss when no gain threshold met', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 101,
        highestCloseSinceEntry: 101,
        atr14: 2,
        currentStopLoss: 95,
      }),
    ).toBeCloseTo(97, 4);
  });

  it('moves stop to breakeven (entry) at 5% gain', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 105,
        highestCloseSinceEntry: 105,
        atr14: null,
        currentStopLoss: 95,
      }),
    ).toBe(100);
  });

  it('moves stop to entry + 5% at 10% gain', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: 95,
      }),
    ).toBe(105);
  });

  it('uses highest of breakeven / profit-lock / ATR trail', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 115,
        highestCloseSinceEntry: 115,
        atr14: 3,
        currentStopLoss: 95,
      }),
    ).toBeCloseTo(109, 4);
  });

  it('never loosens below current stop loss', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: 108,
      }),
    ).toBe(108);
  });

  it('null currentStopLoss is treated as -infinity', () => {
    expect(
      computeTrailingStop({
        entryPrice: 100,
        currentPrice: 110,
        highestCloseSinceEntry: 110,
        atr14: null,
        currentStopLoss: null,
      }),
    ).toBe(105);
  });
});
