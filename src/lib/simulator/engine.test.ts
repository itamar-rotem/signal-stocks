// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runSimulation, type SimulatorParams } from './engine';

const BASE_PARAMS: SimulatorParams = {
  initialCapital: 10_000,
  positionSizePct: 10,
  signalsPerMonth: 5,
  winRatePct: 58,
  avgWinPct: 15,
  avgLossPct: 7,
  months: 12,
  seed: 42,
};

describe('runSimulation', () => {
  it('is deterministic: same params + seed => same result', () => {
    const r1 = runSimulation(BASE_PARAMS);
    const r2 = runSimulation(BASE_PARAMS);
    expect(r1.finalEquity).toBe(r2.finalEquity);
    expect(r1.trades).toHaveLength(r2.trades.length);
    expect(r1.maxDrawdownPct).toBe(r2.maxDrawdownPct);
  });

  it('different seeds produce different results', () => {
    const r1 = runSimulation({ ...BASE_PARAMS, seed: 42 });
    const r2 = runSimulation({ ...BASE_PARAMS, seed: 99 });
    expect(r1.finalEquity).not.toBe(r2.finalEquity);
  });

  it('win count approximately matches winRatePct over many trades (±10%)', () => {
    const result = runSimulation({
      ...BASE_PARAMS,
      signalsPerMonth: 20,
      months: 24,
    });
    const actualWinRate = result.wins / result.totalTrades;
    expect(actualWinRate).toBeGreaterThan(0.48); // 58% - 10%
    expect(actualWinRate).toBeLessThan(0.68); // 58% + 10%
  });

  it('final equity > 0 for reasonable params', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.finalEquity).toBeGreaterThan(0);
  });

  it('maxDrawdownPct >= 0 and <= 100', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.maxDrawdownPct).toBeGreaterThanOrEqual(0);
    expect(result.maxDrawdownPct).toBeLessThanOrEqual(100);
  });

  it('profitFactor > 0 when there are wins', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.wins).toBeGreaterThan(0);
    expect(result.profitFactor).toBeGreaterThan(0);
  });

  it('equityCurve length === months', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.equityCurve).toHaveLength(BASE_PARAMS.months);
  });

  it('totalTrades === signalsPerMonth * months', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.totalTrades).toBe(BASE_PARAMS.signalsPerMonth * BASE_PARAMS.months);
  });

  it('wins + losses === totalTrades', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.wins + result.losses).toBe(result.totalTrades);
  });

  it('winRate property matches wins/totalTrades', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.winRate).toBeCloseTo(result.wins / result.totalTrades, 5);
  });

  it('equityCurve month values are 1-indexed from 1 to months', () => {
    const result = runSimulation(BASE_PARAMS);
    expect(result.equityCurve[0].month).toBe(1);
    expect(result.equityCurve[BASE_PARAMS.months - 1].month).toBe(BASE_PARAMS.months);
  });

  it('finalEquity matches last equityCurve entry', () => {
    const result = runSimulation(BASE_PARAMS);
    const lastEquity = result.equityCurve[result.equityCurve.length - 1].equity;
    expect(result.finalEquity).toBe(lastEquity);
  });

  it('uses default seed 42 when seed is omitted', () => {
    const r1 = runSimulation({ ...BASE_PARAMS, seed: 42 });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { seed: _omit, ...noSeed } = BASE_PARAMS;
    const r2 = runSimulation(noSeed);
    expect(r1.finalEquity).toBe(r2.finalEquity);
  });
});
