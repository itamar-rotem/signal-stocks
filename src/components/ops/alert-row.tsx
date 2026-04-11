import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { SeverityDot } from './severity-dot';
import { StatusPill } from './status-pill';
import { fmtUsd, fmtRelTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AlertRowProps {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  ticker: string;
  name: string;
  signal: string;
  strength: string;
  price: number;
  state: string;
  triggeredAt: Date;
  href: string;
}

export function AlertRow({
  severity,
  ticker,
  name,
  signal,
  strength,
  price,
  state,
  triggeredAt,
  href,
}: AlertRowProps) {
  const validState = ['BUY', 'HOLD', 'WATCH', 'SELL', 'STOP_HIT', 'EXPIRED'].includes(state)
    ? (state as 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED')
    : 'HOLD';

  return (
    <Link
      href={href}
      data-ticker={ticker}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 transition-colors',
        'hover:bg-secondary/50 hover:border-l-primary hover:border-l-2',
        'border-l-2 border-l-transparent',
      )}
    >
      <SeverityDot severity={severity} />

      <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto_auto_auto_auto_auto] items-center gap-x-4 gap-y-1">
        {/* ticker + name */}
        <div className="flex min-w-[80px] flex-col">
          <span className="font-mono text-sm font-semibold tracking-wide">{ticker}</span>
          <span className="text-muted-foreground truncate text-xs">{name}</span>
        </div>

        {/* signal label */}
        <span className="text-muted-foreground truncate font-mono text-xs">{signal}</span>

        {/* strength */}
        <span className="text-muted-foreground/80 hidden font-mono text-xs whitespace-nowrap sm:block">
          {strength.replace('_', ' ')}
        </span>

        {/* price */}
        <span className="font-mono text-sm tabular-nums">{fmtUsd(price)}</span>

        {/* status pill */}
        <StatusPill status={validState} />

        {/* relative time */}
        <span className="text-muted-foreground/60 hidden font-mono text-xs whitespace-nowrap md:block">
          {fmtRelTime(triggeredAt)}
        </span>

        {/* chevron */}
        <ChevronRight className="text-muted-foreground/40 group-hover:text-primary h-4 w-4 flex-shrink-0 transition-colors" />
      </div>
    </Link>
  );
}
