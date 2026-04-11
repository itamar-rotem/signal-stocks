import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
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

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-semibold">{detail.stock.ticker}</h1>
          <p className="text-muted-foreground">{detail.stock.name}</p>
        </div>
        {detail.stock.sector && (
          <p className="text-muted-foreground mt-1 text-sm">{detail.stock.sector}</p>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <StockChart bars={bars} ma200Series={ma200Series} markers={markers} />
        </CardContent>
      </Card>

      <RationaleCard
        summary={detail.rationale.summary}
        fundamentalThesis={detail.rationale.fundamentalThesis}
        technicalContext={detail.rationale.technicalContext}
        strategyNote={detail.rationale.strategyNote}
        confidence={detail.rationale.confidence}
        disclaimer={detail.rationale.disclaimer}
      />

      <Card>
        <CardHeader>
          <CardTitle>Signal History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {detail.signals.map((s) => (
              <li
                key={s.signalId}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{signalTypeLabel(s.signalType)}</Badge>
                  <Badge variant="secondary">{s.strength.replace('_', ' ')}</Badge>
                  {s.volumeConfirmed && <Badge variant="info">Volume ✓</Badge>}
                </div>
                <div className="text-muted-foreground text-xs">
                  {s.triggeredAt.toISOString().slice(0, 10)}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span>Target {fmtPrice(s.recommendation?.targetPrice ?? null)}</span>
                  <span>Stop {fmtPrice(s.recommendation?.stopLoss ?? null)}</span>
                  <RecommendationStateBadge state={s.recommendation?.state ?? null} />
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
