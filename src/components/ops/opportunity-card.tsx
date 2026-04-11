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

  const upside = entryPrice > 0 ? fmtPct(((targetPrice - entryPrice) / entryPrice) * 100) : null;
  const riskPct = entryPrice > 0 ? fmtPct(((entryPrice - stopLoss) / entryPrice) * 100) : null;

  return (
    <div
      data-ticker={ticker}
      className={cn(
        'group border-border bg-card relative flex flex-col rounded-sm border',
        'transition-all duration-200',
        'hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--primary)]',
      )}
    >
      {/* Header */}
      <div className="border-border flex items-start justify-between gap-3 border-b px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-tight">{ticker}</span>
              <SeverityDot severity="medium" pulse />
            </div>
            <div className="text-muted-foreground mt-0.5 truncate text-xs">
              {name}
              {sector && <span className="text-muted-foreground/60"> · {sector}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-muted-foreground/60 hidden font-mono text-[10px] tracking-wider uppercase sm:block">
            {signalType}
          </span>
          <StatusPill status={validState} />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 px-4 py-3">
        {/* Why — full width */}
        <div>
          <div className="text-muted-foreground/60 mb-1 font-mono text-[9px] tracking-widest uppercase">
            WHY
          </div>
          <p className="text-foreground/80 text-sm leading-relaxed">{why}</p>
        </div>

        {/* Data grid: BUY / EXIT / STOP */}
        <div className="border-border grid grid-cols-3 gap-2 border-t pt-3">
          <DataCell label="BUY AT" value={fmtUsd(entryPrice)} />
          <DataCell
            label="EXIT AT"
            value={fmtUsd(targetPrice)}
            subValue={upside ?? undefined}
            subTone="buy"
          />
          <DataCell
            label="STOP"
            value={fmtUsd(stopLoss)}
            subValue={riskPct ?? undefined}
            subTone="sell"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="border-border flex items-center justify-between gap-3 border-t px-4 py-2.5">
        <div className="flex items-center gap-3">
          <ConfidenceBadge confidence={confidence} />
          <span className="text-muted-foreground/60 font-mono text-[10px]">
            {fmtRelTime(triggeredAt)}
          </span>
        </div>
        <Link
          href={href}
          className="text-primary hover:text-primary/80 flex items-center gap-1 font-mono text-[11px] transition-colors"
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
      <div className="text-muted-foreground/60 mb-1 font-mono text-[9px] tracking-widest uppercase">
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
        'inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase',
        color,
      )}
    >
      {confidence}
    </span>
  );
}
