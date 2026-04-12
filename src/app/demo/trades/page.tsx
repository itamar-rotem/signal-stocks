'use client';

import { useState } from 'react';
import { TrendingUp, DollarSign, Activity, BarChart2 } from 'lucide-react';
import { MetricTile } from '@/components/ops/metric-tile';
import { Panel } from '@/components/ops/panel';
import { TradeRow } from '@/components/ops/trade-row';
import { AddTradeForm } from '@/components/ops/add-trade-form';
import { fmtUsd, fmtPnl } from '@/lib/format';
import { DEMO_STOCKS } from '@/lib/demo/fixtures';

interface Trade {
  tradeId: number;
  ticker: string;
  name: string;
  entryPrice: number;
  entryDate: string;
  shares: number;
  exitPrice: number | null;
  exitDate: string | null;
  realizedPnl: number | null;
  notes: string;
  status: 'OPEN' | 'CLOSED';
}

const INITIAL_TRADES: Trade[] = [
  {
    tradeId: 1,
    ticker: 'NOVA',
    name: 'Nova Semiconductor Corp.',
    entryPrice: 95.2,
    entryDate: '2026-03-15',
    shares: 50,
    exitPrice: null,
    exitDate: null,
    realizedPnl: null,
    notes: 'Entered on MA200 breakout signal',
    status: 'OPEN',
  },
  {
    tradeId: 2,
    ticker: 'AURA',
    name: 'Aura Health Systems',
    entryPrice: 118.5,
    entryDate: '2026-02-20',
    shares: 30,
    exitPrice: 132.4,
    exitDate: '2026-03-28',
    realizedPnl: (132.4 - 118.5) * 30, // = 417.00
    notes: 'Hit target on VCP breakout',
    status: 'CLOSED',
  },
];

const AVAILABLE_TICKERS = Object.values(DEMO_STOCKS).map((s) => ({
  ticker: s.stock.ticker,
  name: s.stock.name,
}));

let nextId = 3;

export default function DemoTradesPage() {
  const [trades, setTrades] = useState<Trade[]>(INITIAL_TRADES);

  const openTrades = trades.filter((t) => t.status === 'OPEN');
  const closedTrades = trades.filter((t) => t.status === 'CLOSED');

  const totalInvested = openTrades.reduce((sum, t) => sum + t.entryPrice * t.shares, 0);
  const totalRealizedPnl = closedTrades.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0);
  const winRate =
    closedTrades.length === 0
      ? null
      : Math.round(
          (closedTrades.filter((t) => (t.realizedPnl ?? 0) > 0).length / closedTrades.length) * 100,
        );

  const pnlDisplay = fmtPnl(totalRealizedPnl);

  function handleAdd(data: {
    ticker: string;
    entryPrice: number;
    entryDate: string;
    shares: number;
    notes?: string;
  }) {
    const demoStock = DEMO_STOCKS[data.ticker];
    const name = demoStock?.stock.name ?? data.ticker;
    setTrades((prev) => [
      ...prev,
      {
        tradeId: nextId++,
        ticker: data.ticker,
        name,
        entryPrice: data.entryPrice,
        entryDate: data.entryDate,
        shares: data.shares,
        exitPrice: null,
        exitDate: null,
        realizedPnl: null,
        notes: data.notes ?? '',
        status: 'OPEN',
      },
    ]);
  }

  function handleClose(tradeId: number, exitPrice: number, exitDate: string) {
    setTrades((prev) =>
      prev.map((t) => {
        if (t.tradeId !== tradeId) return t;
        return {
          ...t,
          exitPrice,
          exitDate,
          realizedPnl: (exitPrice - t.entryPrice) * t.shares,
          status: 'CLOSED' as const,
        };
      }),
    );
  }

  function handleRemove(tradeId: number) {
    setTrades((prev) => prev.filter((t) => t.tradeId !== tradeId));
  }

  return (
    <section className="space-y-6">
      {/* Page header */}
      <header>
        <div className="text-muted-foreground font-mono text-xs tracking-widest">
          LODESTAR &#9656; SIGNAL OPS &#9656; DEMO &#9656; TRADES
        </div>
        <h1 className="mt-1 text-3xl font-bold">Trade Tracker</h1>
        <p className="text-muted-foreground mt-1 text-sm">Log, manage, and track your positions.</p>
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
                onClose={(exitPrice, exitDate) => handleClose(t.tradeId, exitPrice, exitDate)}
                onRemove={() => handleRemove(t.tradeId)}
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
              <TradeRow key={t.tradeId} {...t} onRemove={() => handleRemove(t.tradeId)} />
            ))}
          </div>
        )}
      </Panel>

      {/* Log New Trade */}
      <Panel title="LOG NEW TRADE" hint="ENTER POSITION">
        <AddTradeForm availableTickers={AVAILABLE_TICKERS} onSubmit={handleAdd} />
      </Panel>
    </section>
  );
}
