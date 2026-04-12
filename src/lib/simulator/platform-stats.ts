import { runSimulation } from './engine';

export interface PlatformSnapshot {
  date: string; // YYYY-MM-DD (end of month)
  totalSignals: number;
  winRate: number; // 0-1
  avgReturn: number; // e.g. 0.12 = 12%
  avgHoldDays: number;
  riskRewardRatio: number;
  equityValue: number; // cumulative equity if you followed all signals
}

export interface PlatformSummary {
  totalSignals: number;
  overallWinRate: number;
  totalReturn: number; // percentage e.g. 34.5
  maxDrawdown: number; // percentage e.g. 8.2
  avgHoldDays: number;
}

// Platform default params: $100k initial, 5% position, 8 signals/mo,
// 58% win rate, 14% avg win, 7% avg loss, 12 months, seed 777
const PLATFORM_PARAMS = {
  initialCapital: 100_000,
  positionSizePct: 5,
  signalsPerMonth: 8,
  winRatePct: 58,
  avgWinPct: 14,
  avgLossPct: 7,
  months: 12,
  seed: 777,
};

const _result = runSimulation(PLATFORM_PARAMS);

// Generate end-of-month dates going back 12 months from "now" (2026-04-12)
// Months: 2025-04 through 2026-03
const MONTH_DATES: string[] = [
  '2025-04-30',
  '2025-05-31',
  '2025-06-30',
  '2025-07-31',
  '2025-08-31',
  '2025-09-30',
  '2025-10-31',
  '2025-11-30',
  '2025-12-31',
  '2026-01-31',
  '2026-02-28',
  '2026-03-31',
];

// Avg hold days: deterministic synthetic per month (6-18 day range)
function syntheticHoldDays(month: number): number {
  // Simple deterministic variation: 8-16 days
  return 8 + ((month * 7) % 9);
}

// Risk/reward per month: based on win/loss averages with slight variation
function syntheticRiskReward(month: number): number {
  const base = PLATFORM_PARAMS.avgWinPct / PLATFORM_PARAMS.avgLossPct; // ~2.0
  return Math.round((base + ((month % 3) - 1) * 0.15) * 100) / 100;
}

// Build per-month win rates and returns from trade results
const monthlyStats = new Map<
  number,
  { wins: number; losses: number; totalReturn: number; tradeCount: number }
>();

for (const trade of _result.trades) {
  const existing = monthlyStats.get(trade.month) ?? {
    wins: 0,
    losses: 0,
    totalReturn: 0,
    tradeCount: 0,
  };
  existing.tradeCount += 1;
  existing.totalReturn += trade.returnPct;
  if (trade.isWin) {
    existing.wins += 1;
  } else {
    existing.losses += 1;
  }
  monthlyStats.set(trade.month, existing);
}

export const PLATFORM_STATS: PlatformSnapshot[] = _result.equityCurve.map(({ month, equity }) => {
  const stats = monthlyStats.get(month) ?? {
    wins: 0,
    losses: 0,
    totalReturn: 0,
    tradeCount: 0,
  };
  const winRate = stats.tradeCount > 0 ? stats.wins / stats.tradeCount : 0;
  const avgReturn = stats.tradeCount > 0 ? stats.totalReturn / stats.tradeCount / 100 : 0;

  return {
    date: MONTH_DATES[month - 1],
    totalSignals: stats.tradeCount,
    winRate,
    avgReturn,
    avgHoldDays: syntheticHoldDays(month),
    riskRewardRatio: syntheticRiskReward(month),
    equityValue: equity,
  };
});

const _totalSignals = PLATFORM_STATS.reduce((s, r) => s + r.totalSignals, 0);
const _overallWinRate = _result.totalTrades > 0 ? _result.wins / _result.totalTrades : 0;
const _totalReturn = _result.totalReturnPct;
const _maxDrawdown = _result.maxDrawdownPct;
const _avgHoldDays = PLATFORM_STATS.reduce((s, r) => s + r.avgHoldDays, 0) / PLATFORM_STATS.length;

export const PLATFORM_SUMMARY: PlatformSummary = {
  totalSignals: _totalSignals,
  overallWinRate: _overallWinRate,
  totalReturn: _totalReturn,
  maxDrawdown: _maxDrawdown,
  avgHoldDays: _avgHoldDays,
};
