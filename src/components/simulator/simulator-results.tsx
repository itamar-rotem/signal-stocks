'use client';

import type { SimulatorResult } from '@/lib/simulator/engine';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { EquityChart } from '@/components/charts/equity-chart';
import { fmtUsd, fmtPct } from '@/lib/format';

export interface SimulatorResultsProps {
  result: SimulatorResult;
  initialCapital: number;
}

export function SimulatorResults({ result, initialCapital }: SimulatorResultsProps) {
  const {
    finalEquity,
    totalReturnPct,
    maxDrawdownPct,
    profitFactor,
    totalTrades,
    wins,
    losses,
    winRate,
    avgTradeReturnPct,
    equityCurve,
  } = result;

  const isProfit = totalReturnPct >= 0;

  return (
    <div className="space-y-6">
      {/* Disclaimer banner — required per spec */}
      <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <p className="font-mono text-xs leading-relaxed text-amber-300">
          ⚠ DISCLAIMER: Simulated results based on historical data. Past performance does not
          guarantee future results. This is not financial advice.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile
          label="Final Equity"
          value={fmtUsd(finalEquity)}
          hint={`started ${fmtUsd(initialCapital)}`}
          tone={isProfit ? 'buy' : 'sell'}
        />
        <MetricTile
          label="Total Return"
          value={fmtPct(totalReturnPct)}
          hint={`over ${equityCurve.length} months`}
          tone={isProfit ? 'buy' : 'sell'}
        />
        <MetricTile
          label="Max Drawdown"
          value={`-${maxDrawdownPct.toFixed(1)}%`}
          hint="peak-to-trough"
          tone={maxDrawdownPct > 20 ? 'sell' : maxDrawdownPct > 10 ? 'watch' : 'default'}
        />
        <MetricTile
          label="Profit Factor"
          value={
            profitFactor === Infinity ? '∞' : profitFactor === 0 ? '0.00' : profitFactor.toFixed(2)
          }
          hint="gross wins / losses"
          tone={profitFactor >= 1.5 ? 'buy' : profitFactor >= 1 ? 'watch' : 'sell'}
        />
      </div>

      {/* Equity curve */}
      <Panel title="EQUITY CURVE">
        <div className="p-2">
          <EquityChart data={equityCurve} height={260} />
        </div>
      </Panel>

      {/* Trade summary */}
      <Panel title="TRADE SUMMARY">
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Total Trades
            </span>
            <span className="font-mono text-lg font-bold tabular-nums">{totalTrades}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Wins
            </span>
            <span className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
              {wins}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Losses
            </span>
            <span className="font-mono text-lg font-bold text-red-400 tabular-nums">{losses}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Win Rate
            </span>
            <span className="font-mono text-lg font-bold tabular-nums">
              {(winRate * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Avg Trade
            </span>
            <span
              className={`font-mono text-lg font-bold tabular-nums ${avgTradeReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {fmtPct(avgTradeReturnPct)}
            </span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
