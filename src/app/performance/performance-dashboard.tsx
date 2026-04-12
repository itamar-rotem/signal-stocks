'use client';

import Link from 'next/link';
import type { PlatformSnapshot, PlatformSummary } from '@/lib/simulator/platform-stats';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { EquityChart } from '@/components/charts/equity-chart';
import { Button } from '@/components/ui/button';
import { fmtPct } from '@/lib/format';

interface PerformanceDashboardProps {
  stats: PlatformSnapshot[];
  summary: PlatformSummary;
}

export function PerformanceDashboard({ stats, summary }: PerformanceDashboardProps) {
  const equityCurveData = stats.map((s, i) => ({
    month: i + 1,
    equity: s.equityValue,
  }));

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; PERFORMANCE
        </div>
        <h1 className="mt-1 text-3xl font-bold">Platform Performance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Simulated results from Lodestar AI signals over the past 12 months.
        </p>
      </header>

      {/* Disclaimer banner */}
      <div className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <p className="font-mono text-xs leading-relaxed text-amber-300">
          ⚠ DISCLAIMER: Simulated results based on historical data. Past performance does not
          guarantee future results. This is not financial advice.
        </p>
      </div>

      {/* KPI tiles row — 5 metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricTile
          label="Total Signals"
          value={String(summary.totalSignals)}
          hint="past 12 months"
        />
        <MetricTile
          label="Win Rate"
          value={`${(summary.overallWinRate * 100).toFixed(1)}%`}
          hint="all signals"
          tone="buy"
        />
        <MetricTile
          label="Total Return"
          value={fmtPct(summary.totalReturn)}
          hint="simulated"
          tone={summary.totalReturn >= 0 ? 'buy' : 'sell'}
        />
        <MetricTile
          label="Max Drawdown"
          value={`-${summary.maxDrawdown.toFixed(1)}%`}
          hint="peak-to-trough"
          tone={summary.maxDrawdown > 20 ? 'sell' : 'watch'}
        />
        <MetricTile
          label="Avg Hold"
          value={`${summary.avgHoldDays.toFixed(1)}d`}
          hint="per trade"
        />
      </div>

      {/* Equity curve */}
      <Panel title="EQUITY CURVE">
        <div className="p-2">
          <EquityChart data={equityCurveData} height={300} />
        </div>
      </Panel>

      {/* Monthly breakdown table */}
      <Panel title="MONTHLY BREAKDOWN">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-border border-b">
                <th className="text-muted-foreground px-4 py-2.5 text-left font-mono text-[10px] tracking-widest uppercase">
                  Date
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[10px] tracking-widest uppercase">
                  Signals
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[10px] tracking-widest uppercase">
                  Win Rate
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[10px] tracking-widest uppercase">
                  Avg Return
                </th>
                <th className="text-muted-foreground px-4 py-2.5 text-right font-mono text-[10px] tracking-widest uppercase">
                  Equity
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const winRatePct = (row.winRate * 100).toFixed(1);
                const avgReturnPct = (row.avgReturn * 100).toFixed(2);
                const isPositiveReturn = row.avgReturn >= 0;
                return (
                  <tr
                    key={row.date}
                    className="border-border/40 hover:bg-muted/20 border-b transition-colors"
                  >
                    <td className="px-4 py-2.5 font-mono text-sm tabular-nums">{row.date}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                      {row.totalSignals}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                      {winRatePct}%
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono text-sm tabular-nums ${
                        isPositiveReturn ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {isPositiveReturn ? '+' : ''}
                      {avgReturnPct}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-sm tabular-nums">
                      ${row.equityValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* CTA */}
      <div className="border-border bg-card flex items-center justify-between rounded-sm border px-4 py-4">
        <div>
          <p className="font-mono text-sm font-medium">Want to model your own strategy?</p>
          <p className="text-muted-foreground mt-0.5 font-mono text-xs">
            Adjust win rates, position sizes, and more in the interactive simulator.
          </p>
        </div>
        <Link href="/simulator">
          <Button className="font-mono text-xs tracking-widest uppercase">Try the simulator</Button>
        </Link>
      </div>
    </section>
  );
}
