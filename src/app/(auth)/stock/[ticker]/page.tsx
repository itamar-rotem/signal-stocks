import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { serverTrpc } from '@/trpc/server';
import { Badge } from '@/components/ui/badge';
import { RecommendationStateBadge } from '@/components/signals/recommendation-state-badge';
import { RationaleCard } from '@/components/signals/rationale-card';
import { signalTypeLabel } from '@/components/signals/signal-type-label';
import { RATIONALE_DISCLAIMER } from '@/server/services/ai/disclaimer';
import { SiteNav } from '@/components/layout/site-nav';
import { TRPCProvider } from '@/trpc/client';
import { db } from '@/server/db';
import { signalRationales } from '@/server/db/schema';
import { StockChart } from '@/components/charts/stock-chart';
import { Panel } from '@/components/ops/panel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ ticker: string }>;
}

function fmtPrice(n: number | null): string {
  if (n === null) return '—';
  return `$${n.toFixed(2)}`;
}

export default async function StockDetailPage({ params }: PageProps) {
  const { ticker } = await params;
  const trpc = await serverTrpc();
  const data = await trpc.signals.byTicker({ ticker });

  if (!data) notFound();

  const priceHistory = await trpc.signals.priceHistory({ ticker, days: 260 });

  const freshest = data.signals[0];
  const [fullRationale] = freshest
    ? await db
        .select()
        .from(signalRationales)
        .where(eq(signalRationales.signalId, freshest.signalId))
        .limit(1)
    : [];

  return (
    <TRPCProvider>
      <SiteNav />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <header>
          <div className="flex items-baseline gap-3">
            <h1 className="font-mono text-3xl font-semibold">{data.stock.ticker}</h1>
            <p className="text-muted-foreground">{data.stock.name}</p>
          </div>
          {data.stock.sector && (
            <p className="text-muted-foreground mt-1 text-sm">{data.stock.sector}</p>
          )}
        </header>

        {priceHistory && priceHistory.bars.length > 0 && (
          <Panel title="PRICE HISTORY · MA200">
            <StockChart
              bars={priceHistory.bars}
              ma200Series={priceHistory.ma200Series}
              markers={priceHistory.markers}
            />
          </Panel>
        )}

        {fullRationale && (
          <Panel title="AI RATIONALE">
            <div className="px-4 py-4">
              <RationaleCard
                summary={fullRationale.summary}
                fundamentalThesis={fullRationale.fundamentalThesis}
                technicalContext={fullRationale.technicalContext}
                strategyNote={fullRationale.strategyNote}
                confidence={fullRationale.confidence}
                disclaimer={fullRationale.disclaimer || RATIONALE_DISCLAIMER}
              />
            </div>
          </Panel>
        )}

        <Panel title="SIGNAL HISTORY">
          <ul className="divide-border divide-y">
            {data.signals.map((s) => (
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
                  <span>Target {fmtPrice(s.recommendation?.targetPrice ?? null)}</span>
                  <span>Stop {fmtPrice(s.recommendation?.stopLoss ?? null)}</span>
                  <RecommendationStateBadge state={s.recommendation?.state ?? null} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </main>
    </TRPCProvider>
  );
}
