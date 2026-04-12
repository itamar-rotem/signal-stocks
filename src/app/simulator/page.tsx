'use client';

import { useState } from 'react';
import { runSimulation, type SimulatorParams, type SimulatorResult } from '@/lib/simulator/engine';
import { SimulatorForm } from '@/components/simulator/simulator-form';
import { SimulatorResults } from '@/components/simulator/simulator-results';
import { Panel } from '@/components/ops/panel';

export default function SimulatorPage() {
  const [result, setResult] = useState<SimulatorResult | null>(null);
  const [params, setParams] = useState<SimulatorParams | null>(null);

  function handleRun(p: SimulatorParams) {
    setParams(p);
    setResult(runSimulation(p));
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; SIMULATOR
        </div>
        <h1 className="mt-1 text-3xl font-bold">Backtest Simulator</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Model potential outcomes by adjusting signal parameters. All results are simulated.
        </p>
      </header>

      <Panel title="PARAMETERS">
        <SimulatorForm onRun={handleRun} />
      </Panel>

      {result && params && (
        <SimulatorResults result={result} initialCapital={params.initialCapital} />
      )}
    </section>
  );
}
