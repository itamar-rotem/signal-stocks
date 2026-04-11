import Link from 'next/link';
import { serverTrpc } from '@/trpc/server';
import { SignalCard } from '@/components/signals/signal-card';
import { EmptyState } from '@/components/signals/empty-state';

export const dynamic = 'force-dynamic';

export default async function SignalsPage() {
  const trpc = await serverTrpc();
  const signals = await trpc.signals.list({ limit: 20 });

  if (signals.length === 0) {
    return (
      <EmptyState
        title="No active signals yet"
        description="Run the daily pipeline (ingest → fundamentals → signals → recommendations) to populate this view."
      />
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Today&rsquo;s Signals</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {signals.map((s) => (
          <Link key={s.signalId} href={`/stock/${s.stock.ticker}`} className="block">
            <SignalCard
              ticker={s.stock.ticker}
              name={s.stock.name}
              sector={s.stock.sector}
              signalType={s.signalType}
              strength={s.strength}
              volumeConfirmed={s.volumeConfirmed}
              signalScore={s.signalScore}
              fundamentalScore={s.fundamentalScore}
              lastPrice={s.stock.lastPrice}
              targetPrice={s.recommendation?.targetPrice ?? null}
              stopLoss={s.recommendation?.stopLoss ?? null}
              state={s.recommendation?.state ?? null}
              triggeredAt={s.triggeredAt}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
