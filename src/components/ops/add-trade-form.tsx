'use client';

import { useState } from 'react';

export interface AddTradeFormProps {
  availableTickers: { ticker: string; name: string }[];
  onSubmit: (data: {
    ticker: string;
    entryPrice: number;
    entryDate: string;
    shares: number;
    notes?: string;
  }) => void;
  isPending?: boolean;
  error?: string | null;
}

export function AddTradeForm({
  availableTickers,
  onSubmit,
  isPending = false,
  error = null,
}: AddTradeFormProps) {
  const [ticker, setTicker] = useState(availableTickers[0]?.ticker ?? '');
  const [entryPrice, setEntryPrice] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    const price = parseFloat(entryPrice);
    const sharesNum = parseFloat(shares);
    if (!ticker) {
      setFormError('Select a ticker');
      return;
    }
    if (!entryPrice || isNaN(price) || price <= 0) {
      setFormError('Enter a valid entry price');
      return;
    }
    if (!entryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      setFormError('Enter a valid date (YYYY-MM-DD)');
      return;
    }
    if (!shares || isNaN(sharesNum) || sharesNum <= 0) {
      setFormError('Enter a valid number of shares');
      return;
    }
    onSubmit({
      ticker,
      entryPrice: price,
      entryDate,
      shares: sharesNum,
      notes: notes.trim() || undefined,
    });
    // reset on success handled by parent; clear local state
    setEntryPrice('');
    setShares('');
    setNotes('');
  }

  const displayError = formError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div className="flex flex-wrap gap-3">
        {/* Ticker */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
            Ticker
          </label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-input border-border text-foreground focus:border-buy w-32 rounded-sm border px-2 py-1.5 font-mono text-sm uppercase outline-none"
          >
            {availableTickers.map((t) => (
              <option key={t.ticker} value={t.ticker}>
                {t.ticker}
              </option>
            ))}
          </select>
        </div>

        {/* Entry Price */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
            Entry Price
          </label>
          <input
            type="number"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="0.00"
            step="0.01"
            min="0.01"
            className="bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus:border-buy w-32 rounded-sm border px-2 py-1.5 font-mono text-sm tabular-nums outline-none"
          />
        </div>

        {/* Entry Date */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
            Date
          </label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="bg-input border-border text-foreground focus:border-buy w-40 rounded-sm border px-2 py-1.5 font-mono text-sm outline-none"
          />
        </div>

        {/* Shares */}
        <div className="flex flex-col gap-1">
          <label className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
            Shares
          </label>
          <input
            type="number"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0"
            step="0.0001"
            min="0.0001"
            className="bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus:border-buy w-28 rounded-sm border px-2 py-1.5 font-mono text-sm tabular-nums outline-none"
          />
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <label className="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Entry rationale, setup notes..."
          maxLength={500}
          rows={2}
          className="bg-input border-border text-foreground placeholder:text-muted-foreground/50 focus:border-buy w-full max-w-xl resize-none rounded-sm border px-2 py-1.5 font-mono text-xs outline-none placeholder:normal-case"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="text-buy hover:text-buy/80 font-mono text-xs tracking-wider uppercase transition-colors disabled:opacity-50"
        >
          {isPending ? '[LOGGING...]' : '[LOG TRADE]'}
        </button>
        {displayError && <span className="text-sell font-mono text-xs">{displayError}</span>}
      </div>
    </form>
  );
}
