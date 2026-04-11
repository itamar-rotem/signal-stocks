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
    <div className={cn('rounded-sm border border-border bg-card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-3 min-w-0">
            {title && (
              <span className="font-mono text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                {title}
              </span>
            )}
            {hint && (
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground/60 uppercase">
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
