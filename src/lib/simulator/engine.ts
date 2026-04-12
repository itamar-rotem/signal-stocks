// Mulberry32 deterministic PRNG (same algorithm as src/lib/demo/generate.ts)
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulatorParams {
  initialCapital: number; // e.g. 10000
  positionSizePct: number; // e.g. 10 (means 10% of capital per trade)
  signalsPerMonth: number; // e.g. 5
  winRatePct: number; // e.g. 58 (meaning 58%)
  avgWinPct: number; // e.g. 15 (average winning trade return %)
  avgLossPct: number; // e.g. 7 (average losing trade loss %)
  months: number; // e.g. 12
  seed?: number; // for deterministic PRNG, default 42
}

export interface TradeResult {
  month: number; // 1-indexed
  tradeNum: number; // within month
  isWin: boolean;
  returnPct: number; // actual return % (positive or negative)
  pnl: number; // dollar P&L for this trade
  equityAfter: number; // portfolio value after trade
}

export interface SimulatorResult {
  trades: TradeResult[];
  equityCurve: { month: number; equity: number }[]; // end-of-month equity
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number; // actual win rate (may differ slightly from input due to randomness)
  profitFactor: number; // gross wins / gross losses
  avgTradeReturnPct: number;
}

export function runSimulation(params: SimulatorParams): SimulatorResult {
  const {
    initialCapital,
    positionSizePct,
    signalsPerMonth,
    winRatePct,
    avgWinPct,
    avgLossPct,
    months,
    seed = 42,
  } = params;

  const rng = mulberry32(seed);
  const trades: TradeResult[] = [];
  const equityCurve: { month: number; equity: number }[] = [];

  let equity = initialCapital;
  let peakEquity = initialCapital;
  let maxDrawdownPct = 0;
  let grossWins = 0;
  let grossLosses = 0;

  for (let month = 1; month <= months; month++) {
    for (let tradeNum = 1; tradeNum <= signalsPerMonth; tradeNum++) {
      const isWin = rng() * 100 < winRatePct;
      let returnPct: number;

      if (isWin) {
        returnPct = avgWinPct * (0.6 + rng() * 0.8);
      } else {
        returnPct = -(avgLossPct * (0.6 + rng() * 0.8));
      }

      const positionSize = equity * (positionSizePct / 100);
      const pnl = positionSize * (returnPct / 100);
      equity = Math.max(0, equity + pnl);

      // Track drawdown
      if (equity > peakEquity) {
        peakEquity = equity;
      } else {
        const drawdown = ((peakEquity - equity) / peakEquity) * 100;
        if (drawdown > maxDrawdownPct) {
          maxDrawdownPct = drawdown;
        }
      }

      if (isWin) {
        grossWins += Math.abs(pnl);
      } else {
        grossLosses += Math.abs(pnl);
      }

      trades.push({
        month,
        tradeNum,
        isWin,
        returnPct,
        pnl,
        equityAfter: equity,
      });
    }

    equityCurve.push({ month, equity });
  }

  const wins = trades.filter((t) => t.isWin).length;
  const losses = trades.length - wins;
  const totalTrades = trades.length;
  const winRate = totalTrades > 0 ? wins / totalTrades : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;
  const totalReturnPct = ((equity - initialCapital) / initialCapital) * 100;
  const avgTradeReturnPct =
    totalTrades > 0 ? trades.reduce((sum, t) => sum + t.returnPct, 0) / totalTrades : 0;

  return {
    trades,
    equityCurve,
    finalEquity: equity,
    totalReturnPct,
    maxDrawdownPct,
    totalTrades,
    wins,
    losses,
    winRate,
    profitFactor,
    avgTradeReturnPct,
  };
}
