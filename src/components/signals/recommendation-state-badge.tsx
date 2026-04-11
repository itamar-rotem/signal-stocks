import { Badge, type BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

export function stateBadgeVariant(state: string | null): Variant {
  switch (state) {
    case 'BUY':
    case 'SELL':
      return 'success';
    case 'HOLD':
    case 'TAKE_PARTIAL_PROFIT':
      return 'info';
    case 'WATCH':
    case 'DOWNGRADED':
      return 'warning';
    case 'STOP_HIT':
      return 'destructive';
    case 'EXPIRED':
      return 'muted';
    default:
      return 'muted';
  }
}

export function stateBadgeLabel(state: string | null): string {
  if (state === null) return '—';
  return state
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export function RecommendationStateBadge({ state }: { state: string | null }) {
  return <Badge variant={stateBadgeVariant(state)}>{stateBadgeLabel(state)}</Badge>;
}
