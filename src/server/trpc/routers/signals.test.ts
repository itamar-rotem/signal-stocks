// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { transformSignalRow, type SignalJoinRow } from './signals';

describe('transformSignalRow', () => {
  it('maps numeric strings to numbers and nests the shape', () => {
    const row: SignalJoinRow = {
      signalId: 42,
      signalType: 'SIG-02',
      strength: 'strong',
      volumeConfirmed: true,
      fundamentalScore: '78.50',
      signalScore: '82.00',
      triggeredAt: new Date('2026-04-10T14:30:00Z'),
      stockId: 7,
      ticker: 'AAPL',
      name: 'Apple Inc.',
      sector: 'Technology',
      lastPrice: '175.2500',
      recState: 'HOLD',
      recTargetPrice: '195.0000',
      recStopLoss: '168.0000',
      recTrailingStop: null,
      recTransitionedAt: new Date('2026-04-10T15:00:00Z'),
      rationaleSummary: 'Quality earnings + MA200 breakout',
      rationaleConfidence: 'High',
    };

    const out = transformSignalRow(row);

    expect(out.signalId).toBe(42);
    expect(out.signalType).toBe('SIG-02');
    expect(out.fundamentalScore).toBe(78.5);
    expect(out.signalScore).toBe(82);
    expect(out.stock.ticker).toBe('AAPL');
    expect(out.stock.lastPrice).toBe(175.25);
    expect(out.recommendation?.state).toBe('HOLD');
    expect(out.recommendation?.targetPrice).toBe(195);
    expect(out.recommendation?.stopLoss).toBe(168);
    expect(out.recommendation?.trailingStop).toBeNull();
    expect(out.rationale?.summary).toBe('Quality earnings + MA200 breakout');
    expect(out.rationale?.confidence).toBe('High');
  });

  it('returns null recommendation and rationale when absent', () => {
    const row: SignalJoinRow = {
      signalId: 1,
      signalType: 'SIG-01',
      strength: 'medium',
      volumeConfirmed: false,
      fundamentalScore: null,
      signalScore: null,
      triggeredAt: new Date('2026-04-10T14:30:00Z'),
      stockId: 1,
      ticker: 'MSFT',
      name: 'Microsoft',
      sector: 'Technology',
      lastPrice: null,
      recState: null,
      recTargetPrice: null,
      recStopLoss: null,
      recTrailingStop: null,
      recTransitionedAt: null,
      rationaleSummary: null,
      rationaleConfidence: null,
    };
    const out = transformSignalRow(row);
    expect(out.recommendation).toBeNull();
    expect(out.rationale).toBeNull();
    expect(out.fundamentalScore).toBeNull();
    expect(out.stock.lastPrice).toBeNull();
  });
});
