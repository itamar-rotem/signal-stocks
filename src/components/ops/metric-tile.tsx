import { cn } from '@/lib/utils';

export interface MetricTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'buy' | 'watch' | 'sell';
  icon?: React.ReactNode;
  small?: boolean;
}

const TONE_HINT: Record<string, string> = {
  default: 'text-muted-foreground',
  buy: 'text-buy',
  watch: 'text-watch',
  sell: 'text-sell',
};

const TONE_BORDER: Record<string, string> = {
  default: 'border-border',
  buy: 'border-buy/40',
  watch: 'border-watch/40',
  sell: 'border-sell/40',
};

export function MetricTile({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  small = false,
}: MetricTileProps) {
  return (
    <div
      data-metric={label}
      className={cn(
        'relative overflow-hidden rounded-sm border bg-card',
        TONE_BORDER[tone],
        small ? 'px-3 py-2' : 'px-4 py-3',
      )}
    >
      {/* top-right corner accent */}
      <div
        aria-hidden
        className={cn(
          'absolute top-0 right-0 h-px w-8',
          tone === 'buy'
            ? 'bg-buy'
            : tone === 'watch'
              ? 'bg-watch'
              : tone === 'sell'
                ? 'bg-sell'
                : 'bg-primary',
        )}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              'font-mono tracking-widest text-muted-foreground uppercase',
              small ? 'text-[9px]' : 'text-[10px]',
            )}
          >
            {label}
          </div>
          <div
            className={cn(
              'font-mono font-bold tabular-nums leading-none mt-1',
              small ? 'text-lg' : 'text-3xl',
            )}
          >
            {value}
          </div>
          {hint && (
            <div
              className={cn(
                'font-mono mt-1',
                small ? 'text-[9px]' : 'text-[11px]',
                TONE_HINT[tone],
              )}
            >
              {hint}
            </div>
          )}
        </div>
        {icon && !small && (
          <div className="text-muted-foreground/40 mt-0.5 flex-shrink-0">{icon}</div>
        )}
      </div>
    </div>
  );
}
