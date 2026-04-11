import { Activity, Gauge, TrendingUp, Radar } from 'lucide-react';
import { DEMO_SIGNAL_LIST, DEMO_STOCKS } from '@/lib/demo/fixtures';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { AlertRow } from '@/components/ops/alert-row';
import { OpportunityCard } from '@/components/ops/opportunity-card';
import { SeverityDot } from '@/components/ops/severity-dot';
import { signalTypeLabel } from '@/components/signals/signal-type-label';
import { fmtRelTime } from '@/lib/format';

const SEVERITY_MAP: Record<string, 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
  very_strong: 'high',
  strong: 'medium',
  medium: 'low',
};

const LAST_SCAN = new Date('2026-04-10T14:30:00Z');

export default function DemoSignalsPage() {
  const avgConfidence = Math.round(
    DEMO_SIGNAL_LIST.reduce((sum, s) => sum + (s.signalScore ?? 0), 0) / DEMO_SIGNAL_LIST.length,
  );

  return (
    <section className="space-y-6">
      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-muted-foreground font-mono text-xs tracking-widest">
            LODESTAR &#9656; SIGNAL OPS &#9656; DEMO
          </div>
          <h1 className="mt-1 text-3xl font-bold">Signal Control Room</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real-time screen of AI-scored stock setups with entry, exit, and rationale.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <SeverityDot severity="medium" pulse />
          <span className="text-muted-foreground">LIVE</span>
          <span className="text-muted-foreground">·</span>
          <span>LAST SCAN {fmtRelTime(LAST_SCAN)}</span>
        </div>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="ACTIVE SIGNALS"
          value={String(DEMO_SIGNAL_LIST.length)}
          hint={`+${DEMO_SIGNAL_LIST.length} today`}
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricTile
          label="AVG CONFIDENCE"
          value={String(avgConfidence)}
          hint="High"
          tone="buy"
          icon={<Gauge className="h-5 w-5" />}
        />
        <MetricTile
          label="HIT RATE (30D)"
          value="64%"
          hint="+2pt"
          tone="buy"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricTile
          label="UNIVERSE SCANNED"
          value="412"
          hint="2m ago"
          icon={<Radar className="h-5 w-5" />}
        />
      </div>

      {/* Active alerts panel */}
      <Panel title="ACTIVE ALERTS" hint={`${DEMO_SIGNAL_LIST.length} OPEN`}>
        <div className="divide-border divide-y">
          {DEMO_SIGNAL_LIST.map((s) => (
            <AlertRow
              key={s.signalId}
              severity={SEVERITY_MAP[s.strength] ?? 'info'}
              ticker={s.stock.ticker}
              name={s.stock.name}
              signal={signalTypeLabel(s.signalType)}
              strength={s.strength}
              price={s.stock.lastPrice ?? 0}
              state={s.recommendation?.state ?? 'HOLD'}
              triggeredAt={s.triggeredAt}
              href={`/demo/stock/${s.stock.ticker}`}
            />
          ))}
        </div>
      </Panel>

      {/* New opportunities feed */}
      <Panel title="NEW OPPORTUNITIES" hint="ENTRY / EXIT / RATIONALE">
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          {DEMO_SIGNAL_LIST.map((s) => {
            const detail = DEMO_STOCKS[s.stock.ticker];
            return (
              <OpportunityCard
                key={s.signalId}
                ticker={s.stock.ticker}
                name={s.stock.name}
                sector={s.stock.sector}
                why={detail?.rationale.summary ?? s.rationale?.summary ?? ''}
                entryPrice={s.stock.lastPrice ?? 0}
                targetPrice={s.recommendation?.targetPrice ?? (s.stock.lastPrice ?? 0) * 1.18}
                stopLoss={s.recommendation?.stopLoss ?? (s.stock.lastPrice ?? 0) * 0.92}
                confidence={s.rationale?.confidence ?? detail?.rationale.confidence ?? 'Medium'}
                signalType={signalTypeLabel(s.signalType)}
                state={s.recommendation?.state ?? 'HOLD'}
                triggeredAt={s.triggeredAt}
                href={`/demo/stock/${s.stock.ticker}`}
              />
            );
          })}
        </div>
      </Panel>
    </section>
  );
}
