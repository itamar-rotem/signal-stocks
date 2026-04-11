import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from '@/components/signals/recommendation-state-badge';
import { RationaleCard } from '@/components/signals/rationale-card';
import { signalTypeLabel } from '@/components/signals/signal-type-label';
import { StockChart } from '@/components/charts/stock-chart';
import {
  transformPriceHistoryRows,
  buildChartMarkersFromSignals,
} from '@/components/charts/chart-data';
import { DEMO_STOCKS } from '@/lib/demo/fixtures';
import { Panel } from '@/components/ops/panel';
import { MetricTile } from '@/components/ops/metric-tile';
import { StatusPill } from '@/components/ops/status-pill';
import { SeverityDot } from '@/components/ops/severity-dot';
import { fmtUsd } from '@/lib/format';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

export default async function DemoStockDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();
  const detail = DEMO_STOCKS[upper];
  if (!detail) notFound();

  const { bars, ma200Series } = transformPriceHistoryRows(detail.priceHistory);
  const markers = buildChartMarkersFromSignals(
    detail.signals.map((s) => ({
      signalType: s.signalType,
      triggeredAt: s.triggeredAt,
      strength: s.strength,
    })),
  );

  const latestSignal = detail.signals[0];
  const state = latestSignal?.recommendation?.state ?? 'HOLD';
  const validState = ['BUY', 'HOLD', 'WATCH', 'SELL', 'STOP_HIT', 'EXPIRED'].includes(state)
    ? (state as 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED')
    : 'HOLD';

  const targetPrice = latestSignal?.recommendation?.targetPrice ?? detail.stock.lastPrice * 1.18;
  const stopLoss = latestSignal?.recommendation?.stopLoss ?? detail.stock.lastPrice * 0.92;

  return (
    <section className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-muted-foreground font-mono text-xs tracking-widest">
        LODESTAR &#9656; SIGNAL OPS &#9656; DEMO &#9656; {upper}
      </div>

      {/* Header: ticker + KPI strip */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-4xl font-bold tracking-tight">{upper}</h1>
            <StatusPill status={validState} />
            <SeverityDot severity="medium" pulse />
          </div>
          <p className="text-muted-foreground mt-1">
            {detail.stock.name}
            {detail.stock.sector && (
              <span className="text-muted-foreground/60"> · {detail.stock.sector}</span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <MetricTile small label="LAST" value={fmtUsd(detail.stock.lastPrice)} />
          <MetricTile small label="TARGET" value={fmtUsd(targetPrice)} tone="buy" />
          <MetricTile small label="STOP" value={fmtUsd(stopLoss)} tone="sell" />
        </div>
      </div>

      {/* Chart panel */}
      <Panel title="PRICE · MA200 · SIGNAL MARKERS" hint={`${bars.length} DAYS`}>
        <StockChart bars={bars} ma200Series={ma200Series} markers={markers} height={420} />
      </Panel>

      {/* Two-column: rationale + signal history */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="AI RATIONALE">
          <div className="px-4 py-4">
            <RationaleCard
              summary={detail.rationale.summary}
              fundamentalThesis={detail.rationale.fundamentalThesis}
              technicalContext={detail.rationale.technicalContext}
              strategyNote={detail.rationale.strategyNote}
              confidence={detail.rationale.confidence}
              disclaimer={detail.rationale.disclaimer}
            />
          </div>
        </Panel>

        <Panel title="SIGNAL HISTORY">
          <ul className="divide-border divide-y">
            {detail.signals.map((s) => (
              <li
                key={s.signalId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{signalTypeLabel(s.signalType)}</Badge>
                  <Badge variant="secondary">{s.strength.replace('_', ' ')}</Badge>
                  {s.volumeConfirmed && <Badge variant="info">Volume ✓</Badge>}
                </div>
                <div className="text-muted-foreground font-mono text-xs">
                  {s.triggeredAt.toISOString().slice(0, 10)}
                </div>
                <div className="flex items-center gap-3 font-mono text-sm tabular-nums">
                  <span>Target {fmtUsd(s.recommendation?.targetPrice ?? targetPrice)}</span>
                  <span>Stop {fmtUsd(s.recommendation?.stopLoss ?? stopLoss)}</span>
                  <RecommendationStateBadge state={s.recommendation?.state ?? null} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
