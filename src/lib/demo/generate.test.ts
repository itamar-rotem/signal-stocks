import { describe, it, expect } from 'vitest';
import { generateSyntheticSeries } from './generate';

describe('generateSyntheticSeries', () => {
  it('produces a deterministic OHLCV series for a given seed', () => {
    const a = generateSyntheticSeries({
      seed: 42,
      days: 250,
      startPrice: 100,
      endDate: '2026-04-10',
    });
    const b = generateSyntheticSeries({
      seed: 42,
      days: 250,
      startPrice: 100,
      endDate: '2026-04-10',
    });

    expect(a.length).toBe(250);
    expect(b.length).toBe(250);
    expect(a[0]).toEqual(b[0]);
    expect(a[249]).toEqual(b[249]);
    // last date equals endDate
    expect(a[249].date).toBe('2026-04-10');
  });

  it('computes ma200 only after 200 bars are available', () => {
    const rows = generateSyntheticSeries({
      seed: 7,
      days: 250,
      startPrice: 50,
      endDate: '2026-04-10',
    });
    expect(rows[0].ma200).toBeNull();
    expect(rows[198].ma200).toBeNull();
    expect(rows[199].ma200).not.toBeNull();
    expect(rows[249].ma200).not.toBeNull();
  });

  it('each row has valid OHLC relationships', () => {
    const rows = generateSyntheticSeries({
      seed: 3,
      days: 50,
      startPrice: 25,
      endDate: '2026-04-10',
    });
    for (const r of rows) {
      const o = Number(r.open);
      const h = Number(r.high);
      const l = Number(r.low);
      const c = Number(r.close);
      expect(h).toBeGreaterThanOrEqual(Math.max(o, c));
      expect(l).toBeLessThanOrEqual(Math.min(o, c));
      expect(l).toBeGreaterThan(0);
      expect(r.volume).toBeGreaterThan(0);
    }
  });
});
