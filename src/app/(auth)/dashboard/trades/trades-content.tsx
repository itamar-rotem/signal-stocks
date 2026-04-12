'use client';

import { useState } from 'react';
import { TrendingUp, DollarSign, Activity, BarChart2 } from 'lucide-react';
import { trpc } from '@/trpc/client';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { TradeRow } from '@/components/ops/trade-row';
import { AddTradeForm } from '@/components/ops/add-trade-form';
import { fmtUsd, fmtPnl } from '@/lib/format';

type Trade = {
  tradeId: number;
  stockId: number;
  ticker: string;
  name: string;
  entryPrice: number;
  entryDate: string;
  shares: number;
  exitPrice: number | null;
  exitDate: string | null;
  realizedPnl: number | null;
  notes: string | null;
  createdAt: Date;
  status: 'OPEN' | 'CLOSED';
};

const KNOWN_TICKERS = [
  { ticker: 'NOVA', name: 'Nova Semiconductor Corp.' },
  { ticker: 'AURA', name: 'Aura Health Systems' },
  { ticker: 'HELIO', name: 'Helio Energy Partners' },
];

interface TradesContentProps {
  initialTrades: Trade[];
}

export function TradesContent({ initialTrades }: TradesContentProps) {
  const utils = trpc.useUtils();

  const { data: trades = initialTrades } = trpc.trades.list.useQuery(undefined, {
    initialData: initialTrades,
  });

  const addMutation = trpc.trades.add.useMutation({
    onSuccess: () => void utils.trades.list.invalidate(),
  });

  const closeMutation = trpc.trades.close.useMutation({
    onSuccess: () => void utils.trades.list.invalidate(),
  });

  const removeMutation = trpc.trades.remove.useMutation({
    onSuccess: () => void utils.trades.list.invalidate(),
  });

  const [addError, setAddError] = useState<string | null>(null);

  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');

  const totalInvested = openTrades.reduce((sum, t) => sum + t.entryPrice * t.shares, 0);
  const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0);
  const winRate =
    closedTrades.length === 0
      ? null
      : Math.round(
          (closedTrades.filter((t) => (t.realizedPnl ?? 0) > 0).length / closedTrades.length) *
            100,
        );

  const pnlDisplay = fmtPnl(totalRealizedPnl);

  function handleAdd(data: {
    ticker: string;
    entryPrice: number;
    entryDate: string;
    shares: number;
    notes?: string;
  }) {
    setAddError(null);
    addMutation.mutate(data, {
      onError: (err) => setAddError(err.message),
    });
  }

  return (
    <section className="space-y-6">
      {/* Page header */}
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; SIGNAL OPS &#9656; TRADES
        </div>
        <h1 className="mt-1 text-3xl font-bold">Trade Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Log, manage, and track your positions.
        </p>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricTile
          label="OPEN POSITIONS"
          value={String(openTrades.length)}
          hint="active trades"
          icon={<Activity className="h-5 w-5" />}
        />
        <MetricTile
          label="TOTAL INVESTED"
          value={fmtUsd(totalInvested)}
          hint="open positions"
          icon={<DollarSign className="h-5 w-5" />}
        />
        <MetricTile
          label="REALIZED P&L"
          value={pnlDisplay.text}
          hint="closed trades"
          tone={totalRealizedPnl >= 0 ? 'buy' : 'sell'}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <MetricTile
          label="WIN RATE"
          value={winRate !== null ? `${winRate}%` : '—'}
          hint={closedTrades.length > 0 ? `${closedTrades.length} closed` : 'no closed trades'}
          tone={winRate !== null && winRate >= 50 ? 'buy' : 'default'}
          icon={<BarChart2 className="h-5 w-5" />}
        />
      </div>

      {/* Open Positions */}
      <Panel title="OPEN POSITIONS" hint={`${openTrades.length} ACTIVE`}>
        {openTrades.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center py-10 font-mono text-sm">
            No open positions.
          </div>
        ) : (
          <div className="divide-border divide-y">
            {openTrades.map((t) => (
              <TradeRow
                key={t.tradeId}
                {...t}
                onClose={(exitPrice, exitDate) =>
                  closeMutation.mutate({ tradeId: t.tradeId, exitPrice, exitDate })
                }
                onRemove={() => removeMutation.mutate({ tradeId: t.tradeId })}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Closed Trades */}
      <Panel title="CLOSED TRADES" hint={`${closedTrades.length} CLOSED`}>
        {closedTrades.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center py-10 font-mono text-sm">
            No closed trades yet.
          </div>
        ) : (
          <div className="divide-border divide-y">
            {closedTrades.map((t) => (
              <TradeRow
                key={t.tradeId}
                {...t}
                onRemove={() => removeMutation.mutate({ tradeId: t.tradeId })}
              />
            ))}
          </div>
        )}
      </Panel>

      {/* Log New Trade */}
      <Panel title="LOG NEW TRADE" hint="ENTER POSITION">
        <AddTradeForm
          availableTickers={KNOWN_TICKERS}
          onSubmit={handleAdd}
          isPending={addMutation.isPending}
          error={addError}
        />
      </Panel>
    </section>
  );
}
