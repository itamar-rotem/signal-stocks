import { describe, it, expect } from 'vitest';
import { compute14DayATR, type OhlcBar } from './atr';

function bar(high: number, low: number, close: number, i: number): OhlcBar {
  return {
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    high,
    low,
    close,
  };
}

describe('compute14DayATR', () => {
  it('returns null with insufficient bars', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(11, 9, 10, i));
    expect(compute14DayATR(bars)).toBeNull();
  });

  it('returns a positive ATR for a volatile series', () => {
    const bars = Array.from({ length: 20 }, (_, i) =>
      bar(100 + i, 90 + i, 95 + i, i),
    );
    const atr = compute14DayATR(bars);
    expect(atr).not.toBeNull();
    expect(atr!).toBeGreaterThan(0);
  });

  it('returns constant TR when series is flat', () => {
    const bars = Array.from({ length: 20 }, (_, i) => bar(105, 95, 100, i));
    expect(compute14DayATR(bars)).toBeCloseTo(10, 0);
  });
});
