import { describe, it, expect } from 'vitest';
import { fmpHistoricalToDbRows } from './transform';
import type { FmpHistoricalResponse } from './schemas';

function buildFixture(days: number): FmpHistoricalResponse {
  const historical = Array.from({ length: days }, (_, i) => {
    const d = new Date('2026-01-01');
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      open: 100 + i,
      high: 101 + i,
      low: 99 + i,
      close: 100 + i,
      volume: 1_000_000 + i * 100,
    };
  });
  return { symbol: 'TEST', historical };
}

describe('fmpHistoricalToDbRows', () => {
  it('returns one row per historical entry', () => {
    const fixture = buildFixture(10);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows).toHaveLength(10);
  });

  it('sets stockId on every row', () => {
    const fixture = buildFixture(5);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows.every((r) => r.stockId === 42)).toBe(true);
  });

  it('converts numeric price fields to strings for Drizzle', () => {
    const fixture = buildFixture(1);
    const [row] = fmpHistoricalToDbRows(fixture, 42);
    expect(typeof row.open).toBe('string');
    expect(typeof row.close).toBe('string');
    expect(row.close).toBe('100');
  });

  it('preserves volume as number (bigint column mode: number)', () => {
    const fixture = buildFixture(1);
    const [row] = fmpHistoricalToDbRows(fixture, 42);
    expect(typeof row.volume).toBe('number');
    expect(row.volume).toBe(1_000_000);
  });

  it('sets ma150/ma200 to null for early rows before window is reached', () => {
    const fixture = buildFixture(50);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[0].ma150).toBeNull();
    expect(rows[0].ma200).toBeNull();
    expect(rows[49].ma150).toBeNull();
  });

  it('computes ma150 once 150 rows are available', () => {
    const fixture = buildFixture(160);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[148].ma150).toBeNull();
    expect(rows[149].ma150).not.toBeNull();
    // mean of closes 100..249 is 174.5; stored as string
    expect(Number(rows[149].ma150)).toBeCloseTo(174.5, 2);
  });

  it('computes ma200 and a 5-day ma200 slope once 205+ rows are available', () => {
    const fixture = buildFixture(210);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[199].ma200).not.toBeNull();
    expect(rows[204].ma200Slope).not.toBeNull();
    // MA is monotonically increasing (+1/day), 5-day slope of MA ≈ 1
    expect(Number(rows[204].ma200Slope)).toBeCloseTo(1, 2);
  });

  it('returns empty array for empty historical', () => {
    const rows = fmpHistoricalToDbRows(
      { symbol: 'TEST', historical: [] },
      42,
    );
    expect(rows).toEqual([]);
  });

  it('assumes input is already ascending (parseFmpHistorical guarantees this)', () => {
    const fixture = buildFixture(3);
    const rows = fmpHistoricalToDbRows(fixture, 42);
    expect(rows[0].date).toBe('2026-01-01');
    expect(rows[2].date).toBe('2026-01-03');
  });
});
