'use client';

import { useState } from 'react';
import { fmtUsd, fmtPnl } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface TradeRowProps {
  tradeId: number;
  ticker: string;
  name: string;
  entryPrice: number;
  entryDate: string;
  shares: number;
  exitPrice: number | null;
  exitDate: string | null;
  realizedPnl: number | null;
  status: 'OPEN' | 'CLOSED';
  onClose?: (exitPrice: number, exitDate: string) => void;
  onRemove?: () => void;
}

export function TradeRow({
  tradeId: _tradeId,
  ticker,
  name,
  entryPrice,
  entryDate,
  shares,
  exitPrice,
  exitDate,
  realizedPnl,
  status,
  onClose,
  onRemove,
}: TradeRowProps) {
  const [closing, setClosing] = useState(false);
  const [closePrice, setClosePrice] = useState('');
  const [closeDate, setCloseDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [closeError, setCloseError] = useState('');

  function handleConfirmClose() {
    const price = parseFloat(closePrice);
    if (!closePrice || isNaN(price) || price <= 0) {
      setCloseError('Enter a valid exit price');
      return;
    }
    if (!closeDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setCloseError('Enter a valid exit date');
      return;
    }
    setCloseError('');
    onClose?.(price, closeDate);
    setClosing(false);
    setClosePrice('');
  }

  const pnl = realizedPnl !== null ? fmtPnl(realizedPnl) : null;

  return (
    <div
      className={cn(
        'border-l-2 border-l-transparent transition-colors',
        'hover:bg-secondary/50 hover:border-l-primary',
        status === 'OPEN' && 'hover:border-l-buy',
        status === 'CLOSED' && 'hover:border-l-muted-foreground',
      )}
    >
      {/* Main row */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        {/* Left: ticker + name + entry date */}
        <div className="flex min-w-[110px] flex-col">
          <span className="font-mono text-sm font-bold tracking-wide">{ticker}</span>
          <span className="text-muted-foreground truncate text-xs">{name}</span>
          <span className="text-muted-foreground/60 font-mono text-[10px] tracking-wider">
            {entryDate}
          </span>
        </div>

        {/* Center: prices + P&L */}
        <div className="flex min-w-0 flex-1 flex-wrap gap-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Entry
            </span>
            <span className="font-mono text-sm tabular-nums">{fmtUsd(entryPrice)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Shares
            </span>
            <span className="font-mono text-sm tabular-nums">{shares}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              Exit
            </span>
            <span className="font-mono text-sm tabular-nums">
              {exitPrice !== null ? fmtUsd(exitPrice) : '—'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              P&amp;L
            </span>
            {pnl ? (
              <span
                className={cn(
                  'font-mono text-sm tabular-nums',
                  pnl.isPositive ? 'text-buy' : 'text-sell',
                )}
              >
                {pnl.text}
              </span>
            ) : (
              <span className="text-muted-foreground font-mono text-sm">—</span>
            )}
          </div>
          {exitDate && (
            <div className="flex flex-col">
              <span className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
                Closed
              </span>
              <span className="text-muted-foreground font-mono text-sm tabular-nums">
                {exitDate}
              </span>
            </div>
          )}
        </div>

        {/* Right: status badge + action buttons */}
        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase',
              status === 'OPEN'
                ? 'border-buy/60 bg-buy/10 text-buy'
                : 'border-border bg-muted/30 text-muted-foreground',
            )}
          >
            {status}
          </span>
          {status === 'OPEN' && onClose && (
            <button
              onClick={() => setClosing((v) => !v)}
              className="text-watch hover:text-watch/80 font-mono text-xs tracking-wider uppercase transition-colors"
            >
              {closing ? '[CANCEL]' : '[CLOSE]'}
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-sell hover:text-sell/80 font-mono text-xs tracking-wider uppercase transition-colors"
            >
              [DELETE]
            </button>
          )}
        </div>
      </div>

      {/* Inline close form */}
      {closing && (
        <div className="border-border bg-muted/20 flex flex-wrap items-center gap-3 border-t px-4 py-3">
          <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            Close Position:
          </span>
          <input
            type="number"
            value={closePrice}
            onChange={(e) => setClosePrice(e.target.value)}
            placeholder="Exit price"
            step="0.01"
            min="0.01"
            className="bg-input border-border text-foreground placeholder:text-muted-foreground/50 w-32 rounded-sm border px-2 py-1.5 font-mono text-sm tabular-nums outline-none focus:border-buy"
          />
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
            className="bg-input border-border text-foreground w-40 rounded-sm border px-2 py-1.5 font-mono text-sm outline-none focus:border-buy"
          />
          <button
            onClick={handleConfirmClose}
            className="text-buy hover:text-buy/80 font-mono text-xs tracking-wider uppercase transition-colors"
          >
            [CLOSE POSITION]
          </button>
          {closeError && (
            <span className="text-sell font-mono text-xs">{closeError}</span>
          )}
        </div>
      )}
    </div>
  );
}
