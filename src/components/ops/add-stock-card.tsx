import { fmtUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface AddStockCardProps {
  ticker: string;
  name: string;
  sector: string | null;
  lastPrice: number;
  signalType: string;
  onAdd: () => void;
}

export function AddStockCard({
  ticker,
  name,
  sector,
  lastPrice,
  signalType,
  onAdd,
}: AddStockCardProps) {
  return (
    <div
      className={cn(
        'border-border bg-card flex flex-col gap-2 rounded-sm border p-4 transition-colors',
        'hover:border-primary/60 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.2)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-bold tracking-wide">{ticker}</div>
          <div className="text-muted-foreground truncate text-xs">{name}</div>
          {sector && (
            <div className="text-muted-foreground/60 font-mono text-[10px] uppercase tracking-wider">
              {sector}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-mono text-sm tabular-nums">{fmtUsd(lastPrice)}</div>
          <div className="text-muted-foreground/80 font-mono text-[10px] uppercase tracking-wider">
            {signalType}
          </div>
        </div>
      </div>
      <button
        onClick={onAdd}
        className="text-buy hover:text-buy/80 self-start font-mono text-xs uppercase tracking-wider transition-colors"
      >
        [ADD]
      </button>
    </div>
  );
}
