import { percentileRank } from './percentile';

export interface FundamentalMetrics {
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  revenueGrowthYoy: number | null;
  epsGrowth: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  fcfYield: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  evEbitda: number | null;
}

export interface PeerMetrics {
  grossMargin: (number | null)[];
  operatingMargin: (number | null)[];
  netMargin: (number | null)[];
  roe: (number | null)[];
  roa: (number | null)[];
  roic: (number | null)[];
  revenueGrowthYoy: (number | null)[];
  epsGrowth: (number | null)[];
  debtToEquity: (number | null)[];
  currentRatio: (number | null)[];
  interestCoverage: (number | null)[];
  fcfYield: (number | null)[];
  forwardPe: (number | null)[];
  pegRatio: (number | null)[];
  evEbitda: (number | null)[];
}

/** Average non-null scores, or null if all are null. */
function averagePresent(scores: (number | null)[]): number | null {
  const present = scores.filter((s): s is number => s !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Profitability (30% of composite): margins + returns.
 * Higher is better for all six metrics.
 */
export function scoreProfitability(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.grossMargin, peers.grossMargin),
    percentileRank(metrics.operatingMargin, peers.operatingMargin),
    percentileRank(metrics.netMargin, peers.netMargin),
    percentileRank(metrics.roe, peers.roe),
    percentileRank(metrics.roa, peers.roa),
    percentileRank(metrics.roic, peers.roic),
  ];
  return averagePresent(scores);
}

/**
 * Growth (25% of composite): revenue + EPS growth.
 * Higher is better.
 */
export function scoreGrowth(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.revenueGrowthYoy, peers.revenueGrowthYoy),
    percentileRank(metrics.epsGrowth, peers.epsGrowth),
  ];
  return averagePresent(scores);
}

/**
 * Financial Health (25% of composite).
 * - Low debt/equity is better (lowerIsBetter)
 * - High current ratio is better
 * - High interest coverage is better
 * - High FCF yield is better
 */
export function scoreFinancialHealth(
  metrics: FundamentalMetrics,
  peers: PeerMetrics,
): number | null {
  const scores = [
    percentileRank(metrics.debtToEquity, peers.debtToEquity, { lowerIsBetter: true }),
    percentileRank(metrics.currentRatio, peers.currentRatio),
    percentileRank(metrics.interestCoverage, peers.interestCoverage),
    percentileRank(metrics.fcfYield, peers.fcfYield),
  ];
  return averagePresent(scores);
}

/**
 * Valuation (20% of composite): P/E, PEG, EV/EBITDA.
 * All three are lowerIsBetter.
 */
export function scoreValuation(metrics: FundamentalMetrics, peers: PeerMetrics): number | null {
  const scores = [
    percentileRank(metrics.forwardPe, peers.forwardPe, { lowerIsBetter: true }),
    percentileRank(metrics.pegRatio, peers.pegRatio, { lowerIsBetter: true }),
    percentileRank(metrics.evEbitda, peers.evEbitda, { lowerIsBetter: true }),
  ];
  return averagePresent(scores);
}

/**
 * Composite score (0-100) per PRD spec weights:
 *   Profitability 30%, Growth 25%, Health 25%, Valuation 20%.
 *
 * Null categories are dropped; remaining weights rebalance proportionally.
 * Returns null if all categories are null.
 */
export function scoreComposite(
  profitability: number | null,
  growth: number | null,
  health: number | null,
  valuation: number | null,
): number | null {
  const parts = [
    { score: profitability, weight: 0.3 },
    { score: growth, weight: 0.25 },
    { score: health, weight: 0.25 },
    { score: valuation, weight: 0.2 },
  ].filter((p): p is { score: number; weight: number } => p.score !== null);

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weightedSum = parts.reduce((sum, p) => sum + p.score * p.weight, 0);
  return weightedSum / totalWeight;
}
