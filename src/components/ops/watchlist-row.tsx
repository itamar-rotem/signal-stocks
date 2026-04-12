import { SeverityDot } from './severity-dot';
import { StatusPill } from './status-pill';
import { fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface WatchlistRowProps {
  ticker: string;
  name: string;
  sector: string | null;
  lastPrice: number;
  signalSummary: string;
  state: string;
  onRemove: () => void;
}

function stateToSeverity(state: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  switch (state) {
    case 'BUY':
      return 'high';
    case 'HOLD':
      return 'medium';
    case 'WATCH':
      return 'low';
    case 'SELL':
    case 'STOP_HIT':
      return 'critical';
    default:
      return 'info';
  }
}

function toValidState(state: string): 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED' {
  const valid = ['BUY', 'HOLD', 'WATCH', 'SELL', 'STOP_HIT', 'EXPIRED'];
  return valid.includes(state)
    ? (state as 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED')
    : 'HOLD';
}

export function WatchlistRow({
  ticker,
  name,
  sector,
  lastPrice,
  signalSummary,
  state,
  onRemove,
}: WatchlistRowProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-3 transition-colors',
        'hover:bg-secondary/50 hover:border-l-primary hover:border-l-2',
        'border-l-2 border-l-transparent',
      )}
    >
      <SeverityDot severity={stateToSeverity(state)} />

      {/* left: ticker + name + sector */}
      <div className="flex min-w-[100px] flex-col">
        <span className="font-mono text-sm font-semibold tracking-wide">{ticker}</span>
        <span className="text-muted-foreground truncate text-xs">{name}</span>
        {sector && (
          <span className="text-muted-foreground/60 font-mono text-[10px] tracking-wider uppercase">
            {sector}
          </span>
        )}
      </div>

      {/* center: price + signal summary */}
      <div className="min-w-0 flex-1">
        <span className="font-mono text-sm tabular-nums">{fmtUsd(lastPrice)}</span>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{signalSummary}</p>
      </div>

      {/* right: status pill + remove button */}
      <div className="flex flex-shrink-0 items-center gap-3">
        <StatusPill status={toValidState(state)} />
        <button
          onClick={onRemove}
          className="text-sell hover:text-sell/80 font-mono text-xs tracking-wider uppercase transition-colors"
        >
          [REMOVE]
        </button>
      </div>
    </div>
  );
}
