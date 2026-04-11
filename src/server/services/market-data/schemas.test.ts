import { describe, it, expect } from 'vitest';
import { FmpHistoricalResponseSchema, parseFmpHistorical } from './schemas';
import fixture from './fixtures/aapl-historical-small.json';

describe('FmpHistoricalResponseSchema', () => {
  it('parses a valid FMP historical response', () => {
    const result = FmpHistoricalResponseSchema.parse(fixture);
    expect(result.symbol).toBe('AAPL');
    expect(result.historical).toHaveLength(10);
    expect(result.historical[0].date).toBe('2026-04-10');
    expect(result.historical[0].close).toBe(176.2);
  });

  it('ignores unknown fields on historical entries', () => {
    const input = {
      symbol: 'TEST',
      historical: [
        {
          date: '2026-01-01',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
          someUnknownField: 'ignored',
        },
      ],
    };
    const result = FmpHistoricalResponseSchema.parse(input);
    expect(result.historical[0].close).toBe(100.5);
  });

  it('rejects missing required fields', () => {
    const input = {
      symbol: 'TEST',
      historical: [{ date: '2026-01-01', open: 100 }],
    };
    expect(() => FmpHistoricalResponseSchema.parse(input)).toThrow();
  });

  it('rejects non-ISO date strings', () => {
    const input = {
      symbol: 'TEST',
      historical: [
        {
          date: '04/10/2026',
          open: 100,
          high: 101,
          low: 99,
          close: 100.5,
          volume: 1000,
        },
      ],
    };
    expect(() => FmpHistoricalResponseSchema.parse(input)).toThrow();
  });
});

describe('parseFmpHistorical', () => {
  it('returns historical rows sorted ASCENDING by date', () => {
    const result = parseFmpHistorical(fixture);
    expect(result.symbol).toBe('AAPL');
    // fixture is newest-first (2026-04-10) -- parser should reverse to oldest-first
    expect(result.historical[0].date).toBe('2026-03-28');
    expect(result.historical[9].date).toBe('2026-04-10');
  });

  it('closes are in chronological order', () => {
    const result = parseFmpHistorical(fixture);
    const dates = result.historical.map((r) => r.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
