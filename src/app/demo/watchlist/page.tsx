'use client';

import { useState, useMemo } from 'react';
import { Eye, Gauge } from 'lucide-react';
import { DEMO_STOCKS } from '@/lib/demo/fixtures';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { WatchlistRow } from '@/components/ops/watchlist-row';
import { AddStockCard } from '@/components/ops/add-stock-card';

export default function DemoWatchlistPage() {
  const [watchedTickers, setWatchedTickers] = useState<Set<string>>(new Set(['NOVA']));
  const [search, setSearch] = useState('');

  const allStocks = Object.values(DEMO_STOCKS);

  const watchedItems = useMemo(
    () => allStocks.filter((s) => watchedTickers.has(s.stock.ticker)),
    [watchedTickers],
  );

  const availableItems = useMemo(() => {
    const q = search.toLowerCase();
    return allStocks.filter((s) => {
      if (watchedTickers.has(s.stock.ticker)) return false;
      if (!q) return true;
      return (
        s.stock.ticker.toLowerCase().includes(q) || s.stock.name.toLowerCase().includes(q)
      );
    });
  }, [watchedTickers, search]);

  const avgConfidence = useMemo(() => {
    if (watchedItems.length === 0) return 0;
    const total = watchedItems.reduce((sum, s) => {
      const score = s.signals[0]?.signalScore ?? 0;
      return sum + score;
    }, 0);
    return Math.round(total / watchedItems.length);
  }, [watchedItems]);

  function addTicker(ticker: string) {
    setWatchedTickers((prev) => new Set([...prev, ticker]));
  }

  function removeTicker(ticker: string) {
    setWatchedTickers((prev) => {
      const next = new Set(prev);
      next.delete(ticker);
      return next;
    });
  }

  return (
    <section className="space-y-6">
      {/* Page header */}
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; SIGNAL OPS &#9656; DEMO &#9656; WATCHLIST
        </div>
        <h1 className="mt-1 text-3xl font-bold">Watchlist</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track stocks you&apos;re interested in. Add from the signals page or search below.
        </p>
      </header>

      {/* Search input */}
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticker..."
          className="bg-card border-border focus:border-primary w-full max-w-xs rounded-sm border px-3 py-2 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:ring-0"
        />
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="WATCHING"
          value={String(watchedTickers.size)}
          hint="stocks tracked"
          icon={<Eye className="h-5 w-5" />}
        />
        <MetricTile
          label="AVG CONFIDENCE"
          value={watchedItems.length > 0 ? String(avgConfidence) : '—'}
          hint={avgConfidence >= 75 ? 'High' : avgConfidence >= 60 ? 'Medium' : 'Low'}
          tone={avgConfidence >= 75 ? 'buy' : avgConfidence >= 60 ? 'watch' : 'default'}
          icon={<Gauge className="h-5 w-5" />}
        />
      </div>

      {/* Your Watchlist panel */}
      <Panel title="YOUR WATCHLIST" hint={`${watchedTickers.size} STOCKS`}>
        {watchedItems.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center py-12 font-mono text-sm">
            No stocks on your watchlist yet. Add one from the signal control room.
          </div>
        ) : (
          <div className="divide-border divide-y">
            {watchedItems.map((s) => {
              const signal = s.signals[0];
              return (
                <WatchlistRow
                  key={s.stock.ticker}
                  ticker={s.stock.ticker}
                  name={s.stock.name}
                  sector={s.stock.sector}
                  lastPrice={s.stock.lastPrice}
                  signalSummary={s.rationale.summary}
                  state={signal?.recommendation?.state ?? 'HOLD'}
                  onRemove={() => removeTicker(s.stock.ticker)}
                />
              );
            })}
          </div>
        )}
      </Panel>

      {/* Add to Watchlist panel */}
      <Panel title="ADD TO WATCHLIST" hint="DEMO UNIVERSE">
        {availableItems.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center py-8 font-mono text-sm">
            {search ? 'No matches found.' : 'All demo stocks are on your watchlist.'}
          </div>
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableItems.map((s) => {
              const signal = s.signals[0];
              return (
                <AddStockCard
                  key={s.stock.ticker}
                  ticker={s.stock.ticker}
                  name={s.stock.name}
                  sector={s.stock.sector}
                  lastPrice={s.stock.lastPrice}
                  signalType={signal?.signalType ?? '—'}
                  onAdd={() => addTicker(s.stock.ticker)}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </section>
  );
}
