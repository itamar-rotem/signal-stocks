'use client';

import { useState } from 'react';
import type { SimulatorParams } from '@/lib/simulator/engine';
import { Button } from '@/components/ui/button';

export interface SimulatorFormProps {
  onRun: (params: SimulatorParams) => void;
  isRunning?: boolean;
}

const INPUT_CLASS =
  'w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-cyan-400 placeholder:text-muted-foreground/40';

const LABEL_CLASS = 'font-mono text-[10px] tracking-widest uppercase text-muted-foreground';

export function SimulatorForm({ onRun, isRunning = false }: SimulatorFormProps) {
  const [initialCapital, setInitialCapital] = useState(10_000);
  const [positionSizePct, setPositionSizePct] = useState(10);
  const [signalsPerMonth, setSignalsPerMonth] = useState(5);
  const [winRatePct, setWinRatePct] = useState(58);
  const [avgWinPct, setAvgWinPct] = useState(14);
  const [avgLossPct, setAvgLossPct] = useState(7);
  const [months, setMonths] = useState(12);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onRun({
      initialCapital,
      positionSizePct,
      signalsPerMonth,
      winRatePct,
      avgWinPct,
      avgLossPct,
      months,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {/* Initial Capital */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Initial Capital</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              $
            </span>
            <input
              type="number"
              className={`${INPUT_CLASS} pl-6`}
              value={initialCapital}
              min={100}
              max={10_000_000}
              step={100}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Position Size */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Position Size</label>
          <div className="relative">
            <input
              type="number"
              className={`${INPUT_CLASS} pr-6`}
              value={positionSizePct}
              min={1}
              max={100}
              step={1}
              onChange={(e) => setPositionSizePct(Number(e.target.value))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>

        {/* Signals per Month */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Signals / Month</label>
          <input
            type="number"
            className={INPUT_CLASS}
            value={signalsPerMonth}
            min={1}
            max={50}
            step={1}
            onChange={(e) => setSignalsPerMonth(Number(e.target.value))}
          />
        </div>

        {/* Win Rate */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>
            Win Rate
            <span className="ml-2 text-[9px] text-cyan-400/70">platform avg: 58%</span>
          </label>
          <div className="relative">
            <input
              type="number"
              className={`${INPUT_CLASS} pr-6`}
              value={winRatePct}
              min={1}
              max={99}
              step={1}
              onChange={(e) => setWinRatePct(Number(e.target.value))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>

        {/* Avg Win */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Avg Win</label>
          <div className="relative">
            <input
              type="number"
              className={`${INPUT_CLASS} pr-6`}
              value={avgWinPct}
              min={0.1}
              max={500}
              step={0.5}
              onChange={(e) => setAvgWinPct(Number(e.target.value))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>

        {/* Avg Loss */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Avg Loss</label>
          <div className="relative">
            <input
              type="number"
              className={`${INPUT_CLASS} pr-6`}
              value={avgLossPct}
              min={0.1}
              max={100}
              step={0.5}
              onChange={(e) => setAvgLossPct(Number(e.target.value))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>

        {/* Period */}
        <div className="flex flex-col gap-1.5">
          <label className={LABEL_CLASS}>Period</label>
          <div className="relative">
            <input
              type="number"
              className={`${INPUT_CLASS} pr-16`}
              value={months}
              min={1}
              max={120}
              step={1}
              onChange={(e) => setMonths(Number(e.target.value))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground">
              months
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Button
          type="submit"
          disabled={isRunning}
          className="font-mono text-xs tracking-widest uppercase bg-emerald-600 hover:bg-emerald-500 text-white border-0"
        >
          {isRunning ? '[ RUNNING... ]' : '[ RUN SIMULATION ]'}
        </Button>
      </div>
    </form>
  );
}
