import { cn } from '@/lib/utils';

export interface PanelProps {
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Panel({ title, hint, action, children, className }: PanelProps) {
  return (
    <div className={cn('border-border bg-card rounded-sm border', className)}>
      {(title || action) && (
        <div className="border-border flex items-center justify-between gap-3 border-b px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            {title && (
              <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-widest uppercase">
                {title}
              </span>
            )}
            {hint && (
              <span className="text-muted-foreground/60 font-mono text-[10px] tracking-wider uppercase">
                {hint}
              </span>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
