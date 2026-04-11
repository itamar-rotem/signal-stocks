import Link from 'next/link';
import { DEMO_SIGNAL_LIST } from '@/lib/demo/fixtures';
import { SignalCard } from '@/components/signals/signal-card';

export default function DemoSignalsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Demo signals</h1>
        <p className="text-muted-foreground text-sm">
          Three synthetic tickers — click a card to see the chart + AI rationale.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_SIGNAL_LIST.map((s) => (
          <Link key={s.signalId} href={`/demo/stock/${s.stock.ticker}`} className="block">
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
