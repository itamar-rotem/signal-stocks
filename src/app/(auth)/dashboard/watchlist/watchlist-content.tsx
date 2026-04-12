'use client';

import { useState } from 'react';
import { Eye, Gauge } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { Panel } from '@/components/ops/panel';
import { MetricTile } from '@/components/ops/metric-tile';
import { WatchlistRow } from '@/components/ops/watchlist-row';

type WatchlistItem = {
  watchlistId: number;
  stockId: number;
  ticker: string;
  name: string;
  sector: string | null;
  lastPrice: number | null;
  source: 'manual' | 'signal';
  addedAt: Date;
};

interface WatchlistContentProps {
  initialItems: WatchlistItem[];
}

export function WatchlistContent({ initialItems }: WatchlistContentProps) {
  const [addTicker, setAddTicker] = useState('');

  const utils = trpc.useUtils();

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: () => {
      void utils.watchlist.list.invalidate();
    },
  });

  const addMutation = trpc.watchlist.add.useMutation({
    onSuccess: () => {
      setAddTicker('');
      void utils.watchlist.list.invalidate();
    },
  });

  const { data: items = initialItems } = trpc.watchlist.list.useQuery(undefined, {
    initialData: initialItems,
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const t = addTicker.trim();
    if (!t) return;
    addMutation.mutate({ ticker: t });
  }

  return (
    <section className="space-y-6">
      {/* Page header */}
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; SIGNAL OPS &#9656; WATCHLIST
        </div>
        <h1 className="mt-1 text-3xl font-bold">Watchlist</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track stocks you&apos;re interested in.
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="WATCHING"
          value={String(items.length)}
          hint="stocks tracked"
          icon={<Eye className="h-5 w-5" />}
        />
        <MetricTile
          label="SOURCE"
          value="—"
          hint="manual + signal"
          icon={<Gauge className="h-5 w-5" />}
        />
      </div>

      {/* Add ticker */}
      <Panel title="ADD TO WATCHLIST" hint="ENTER TICKER">
        <form onSubmit={handleAdd} className="flex items-center gap-3 p-4">
          <input
            type="text"
            value={addTicker}
            onChange={(e) => setAddTicker(e.target.value)}
            placeholder="Enter ticker..."
            className="bg-card border-border focus:border-primary placeholder:text-muted-foreground/50 w-full max-w-xs rounded-sm border px-3 py-2 font-mono text-sm uppercase transition-colors outline-none placeholder:normal-case"
          />
          <button
            type="submit"
            disabled={addMutation.isPending || !addTicker.trim()}
            className="text-buy hover:text-buy/80 font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-50"
          >
            {addMutation.isPending ? '[ADDING...]' : '[ADD]'}
          </button>
          {addMutation.isError && (
            <span className="text-sell font-mono text-xs">{addMutation.error.message}</span>
          )}
        </form>
      </Panel>

      {/* Your Watchlist panel */}
      <Panel title="YOUR WATCHLIST" hint={`${items.length} STOCKS`}>
        {items.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center py-12 font-mono text-sm">
            No stocks on your watchlist yet.
          </div>
        ) : (
          <div className="divide-border divide-y">
            {items.map((item) => (
              <WatchlistRow
                key={item.watchlistId}
                ticker={item.ticker}
                name={item.name}
                sector={item.sector}
                lastPrice={item.lastPrice ?? 0}
                signalSummary={`Added via ${item.source}`}
                state="HOLD"
                onRemove={() => removeMutation.mutate({ stockId: item.stockId })}
              />
            ))}
          </div>
        )}
      </Panel>
    </section>
  );
}
