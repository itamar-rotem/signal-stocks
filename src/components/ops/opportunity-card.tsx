import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SeverityDot } from './severity-dot';
import { StatusPill } from './status-pill';
import { fmtUsd, fmtRelTime, fmtPct } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface OpportunityCardProps {
  ticker: string;
  name: string;
  sector: string | null;
  why: string;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: string;
  signalType: string;
  state: string;
  triggeredAt: Date;
  href: string;
}

export function OpportunityCard({
  ticker,
  name,
  sector,
  why,
  entryPrice,
  targetPrice,
  stopLoss,
  confidence,
  signalType,
  state,
  triggeredAt,
  href,
}: OpportunityCardProps) {
  const validState = ['BUY', 'HOLD', 'WATCH', 'SELL', 'STOP_HIT', 'EXPIRED'].includes(state)
    ? (state as 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED')
    : 'HOLD';

  const upside =
    entryPrice > 0 ? fmtPct(((targetPrice - entryPrice) / entryPrice) * 100) : null;
  const riskPct =
    entryPrice > 0 ? fmtPct(((entryPrice - stopLoss) / entryPrice) * 100) : null;

  return (
    <div
      data-ticker={ticker}
      className={cn(
        'group relative flex flex-col rounded-sm border border-border bg-card',
        'transition-all duration-200',
        'hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--primary)]',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight">{ticker}</span>
              <SeverityDot severity="medium" pulse />
            </div>
            <div className="text-muted-foreground text-xs mt-0.5 truncate">
              {name}
              {sector && <span className="text-muted-foreground/60"> · {sector}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-mono text-[10px] text-muted-foreground/60 uppercase tracking-wider hidden sm:block">
            {signalType}
          </span>
          <StatusPill status={validState} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 px-4 py-3 flex-1">
        {/* Why — full width */}
        <div>
          <div className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">
            WHY
          </div>
          <p className="text-sm leading-relaxed text-foreground/80">{why}</p>
        </div>

        {/* Data grid: BUY / EXIT / STOP */}
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3">
          <DataCell label="BUY AT" value={fmtUsd(entryPrice)} />
          <DataCell label="EXIT AT" value={fmtUsd(targetPrice)} subValue={upside ?? undefined} subTone="buy" />
          <DataCell label="STOP" value={fmtUsd(stopLoss)} subValue={riskPct ?? undefined} subTone="sell" />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border">
        <div className="flex items-center gap-3">
          <ConfidenceBadge confidence={confidence} />
          <span className="font-mono text-[10px] text-muted-foreground/60">
            {fmtRelTime(triggeredAt)}
          </span>
        </div>
        <Link
          href={href}
          className="flex items-center gap-1 font-mono text-[11px] text-primary hover:text-primary/80 transition-colors"
        >
          View analysis
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function DataCell({
  label,
  value,
  subValue,
  subTone,
}: {
  label: string;
  value: string;
  subValue?: string;
  subTone?: 'buy' | 'sell';
}) {
  return (
    <div>
      <div className="font-mono text-[9px] text-muted-foreground/60 uppercase tracking-widest mb-1">
        {label}
      </div>
      <div className="font-mono text-base font-semibold tabular-nums">{value}</div>
      {subValue && (
        <div
          className={cn(
            'font-mono text-[10px] tabular-nums',
            subTone === 'buy' ? 'text-buy' : 'text-sell',
          )}
        >
          {subValue}
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const lower = confidence.toLowerCase();
  const color =
    lower === 'high'
      ? 'border-buy/60 bg-buy/10 text-buy'
      : lower === 'medium'
        ? 'border-watch/60 bg-watch/10 text-watch'
        : 'border-severity-info/60 bg-severity-info/10 text-severity-info';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider',
        color,
      )}
    >
      {confidence}
    </span>
  );
}
