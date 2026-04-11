import { describe, it, expect } from 'vitest';
import {
  transformPriceHistoryRows,
  buildChartMarkersFromSignals,
  type PriceHistoryRow,
} from './chart-data';

describe('transformPriceHistoryRows', () => {
  it('converts drizzle numeric strings to chart bars sorted ascending by date', () => {
    const rows: PriceHistoryRow[] = [
      {
        date: '2026-01-03',
        open: '100.00',
        high: '102.50',
        low: '99.75',
        close: '101.25',
        volume: 1_200_000,
        ma200: '98.50',
      },
      {
        date: '2026-01-02',
        open: '99.00',
        high: '101.00',
        low: '98.50',
        close: '100.00',
        volume: 900_000,
        ma200: '98.30',
      },
    ];

    const out = transformPriceHistoryRows(rows);

    expect(out.bars).toHaveLength(2);
    expect(out.bars[0].time).toBe('2026-01-02');
    expect(out.bars[0].open).toBe(99);
    expect(out.bars[0].high).toBe(101);
    expect(out.bars[0].low).toBe(98.5);
    expect(out.bars[0].close).toBe(100);
    expect(out.bars[1].time).toBe('2026-01-03');
    expect(out.ma200Series).toHaveLength(2);
    expect(out.ma200Series[0]).toEqual({ time: '2026-01-02', value: 98.3 });
    expect(out.ma200Series[1]).toEqual({ time: '2026-01-03', value: 98.5 });
  });

  it('skips null ma200 values in the ma200 series but keeps the bar', () => {
    const rows: PriceHistoryRow[] = [
      {
        date: '2026-01-02',
        open: '99.00',
        high: '101.00',
        low: '98.50',
        close: '100.00',
        volume: 900_000,
        ma200: null,
      },
      {
        date: '2026-01-03',
        open: '100.00',
        high: '102.50',
        low: '99.75',
        close: '101.25',
        volume: 1_200_000,
        ma200: '98.50',
      },
    ];
    const out = transformPriceHistoryRows(rows);
    expect(out.bars).toHaveLength(2);
    expect(out.ma200Series).toHaveLength(1);
    expect(out.ma200Series[0]).toEqual({ time: '2026-01-03', value: 98.5 });
  });
});

describe('buildChartMarkersFromSignals', () => {
  it('creates a marker per signal with a label derived from the signal type', () => {
    const markers = buildChartMarkersFromSignals([
      { signalType: 'SIG-02', triggeredAt: new Date('2026-01-05T14:30:00Z'), strength: 'strong' },
      { signalType: 'SIG-04', triggeredAt: new Date('2026-02-10T14:30:00Z'), strength: 'medium' },
    ]);

    expect(markers).toHaveLength(2);
    expect(markers[0].time).toBe('2026-01-05');
    expect(markers[0].position).toBe('belowBar');
    expect(markers[0].shape).toBe('arrowUp');
    expect(markers[0].text).toContain('SIG-02');
    expect(markers[1].time).toBe('2026-02-10');
  });
});
