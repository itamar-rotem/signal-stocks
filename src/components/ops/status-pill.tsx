import { cn } from '@/lib/utils';

export interface StatusPillProps {
  status: 'BUY' | 'HOLD' | 'WATCH' | 'SELL' | 'STOP_HIT' | 'EXPIRED';
}

const STYLE_MAP: Record<StatusPillProps['status'], string> = {
  BUY: 'border-buy/60 bg-buy/10 text-buy',
  HOLD: 'border-hold/60 bg-hold/10 text-hold',
  WATCH: 'border-watch/60 bg-watch/10 text-watch',
  SELL: 'border-sell/60 bg-sell/10 text-sell',
  STOP_HIT: 'border-sell/60 bg-sell/10 text-sell',
  EXPIRED: 'border-severity-info/60 bg-severity-info/10 text-severity-info',
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wider uppercase',
        STYLE_MAP[status] ?? 'border-border bg-muted text-muted-foreground',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
