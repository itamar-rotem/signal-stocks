import { cn } from '@/lib/utils';

export interface SeverityDotProps {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  pulse?: boolean;
}

const COLOR_MAP: Record<SeverityDotProps['severity'], string> = {
  critical: 'bg-severity-critical',
  high: 'bg-severity-high',
  medium: 'bg-severity-medium',
  low: 'bg-severity-low',
  info: 'bg-severity-info',
};

export function SeverityDot({ severity, pulse = false }: SeverityDotProps) {
  return (
    <span
      data-severity={severity}
      className={cn(
        'inline-block h-2 w-2 flex-shrink-0 rounded-full',
        COLOR_MAP[severity],
        pulse && 'animate-pulse-dot',
      )}
    />
  );
}
