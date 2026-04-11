import { describe, it, expect } from 'vitest';
import {
  scoreProfitability,
  scoreGrowth,
  scoreFinancialHealth,
  scoreValuation,
  scoreComposite,
  type FundamentalMetrics,
  type PeerMetrics,
} from './scoring';

const emptyPeers: PeerMetrics = {
  grossMargin: [],
  operatingMargin: [],
  netMargin: [],
  roe: [],
  roa: [],
  roic: [],
  revenueGrowthYoy: [],
  epsGrowth: [],
  debtToEquity: [],
  currentRatio: [],
  interestCoverage: [],
  fcfYield: [],
  forwardPe: [],
  pegRatio: [],
  evEbitda: [],
};

function allNulls(): FundamentalMetrics {
  return {
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    roe: null,
    roa: null,
    roic: null,
    revenueGrowthYoy: null,
    epsGrowth: null,
    debtToEquity: null,
    currentRatio: null,
    interestCoverage: null,
    fcfYield: null,
    forwardPe: null,
    pegRatio: null,
    evEbitda: null,
  };
}

describe('scoreProfitability', () => {
  it('returns null when all profitability metrics missing', () => {
    expect(scoreProfitability(allNulls(), emptyPeers)).toBeNull();
  });

  it('returns a score 0-100 for top performer', () => {
    const metrics = { ...allNulls(), grossMargin: 0.5, netMargin: 0.25 };
    const peers = {
      ...emptyPeers,
      grossMargin: [0.1, 0.2, 0.3, 0.5],
      netMargin: [0.05, 0.1, 0.15, 0.25],
    };
    const score = scoreProfitability(metrics, peers);
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(80);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it('returns a low score for bottom performer', () => {
    const metrics = { ...allNulls(), grossMargin: 0.1, netMargin: 0.05 };
    const peers = {
      ...emptyPeers,
      grossMargin: [0.1, 0.2, 0.3, 0.5],
      netMargin: [0.05, 0.1, 0.15, 0.25],
    };
    const score = scoreProfitability(metrics, peers);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThanOrEqual(20);
  });
});

describe('scoreGrowth', () => {
  it('returns null when all growth metrics missing', () => {
    expect(scoreGrowth(allNulls(), emptyPeers)).toBeNull();
  });

  it('scores positive revenue growth favorably', () => {
    const metrics = { ...allNulls(), revenueGrowthYoy: 0.25 };
    const peers = { ...emptyPeers, revenueGrowthYoy: [-0.1, 0.0, 0.1, 0.25] };
    const score = scoreGrowth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreFinancialHealth', () => {
  it('returns null when all health metrics missing', () => {
    expect(scoreFinancialHealth(allNulls(), emptyPeers)).toBeNull();
  });

  it('rewards low debt/equity (lowerIsBetter)', () => {
    const metrics = { ...allNulls(), debtToEquity: 0.1 };
    const peers = { ...emptyPeers, debtToEquity: [0.1, 1.0, 2.0, 3.0] };
    const score = scoreFinancialHealth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('rewards high interest coverage (higherIsBetter)', () => {
    const metrics = { ...allNulls(), interestCoverage: 50 };
    const peers = { ...emptyPeers, interestCoverage: [1, 5, 10, 50] };
    const score = scoreFinancialHealth(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreValuation', () => {
  it('returns null when all valuation metrics missing', () => {
    expect(scoreValuation(allNulls(), emptyPeers)).toBeNull();
  });

  it('rewards low P/E (lowerIsBetter)', () => {
    const metrics = { ...allNulls(), forwardPe: 10 };
    const peers = { ...emptyPeers, forwardPe: [10, 20, 30, 50] };
    const score = scoreValuation(metrics, peers);
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

describe('scoreComposite', () => {
  it('weights categories per spec (30/25/25/20)', () => {
    expect(scoreComposite(100, 100, 100, 100)).toBe(100);
    expect(scoreComposite(0, 0, 0, 0)).toBe(0);
    expect(scoreComposite(100, 0, 0, 0)).toBe(30);
    expect(scoreComposite(0, 100, 0, 0)).toBe(25);
    expect(scoreComposite(0, 0, 100, 0)).toBe(25);
    expect(scoreComposite(0, 0, 0, 100)).toBe(20);
  });

  it('ignores nulls and rebalances remaining weights', () => {
    // If growth is null, remaining weights 30+25+20=75; all 100 → 100
    expect(scoreComposite(100, null, 100, 100)).toBe(100);
    expect(scoreComposite(100, null, 0, 0)).toBeCloseTo((100 * 30) / 75, 1);
  });

  it('returns null when all categories null', () => {
    expect(scoreComposite(null, null, null, null)).toBeNull();
  });
});
