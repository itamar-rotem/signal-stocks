import { describe, it, expect } from 'vitest';
import { stateBadgeVariant, stateBadgeLabel } from './recommendation-state-badge';

describe('stateBadgeVariant', () => {
  it('maps each state to a badge variant', () => {
    expect(stateBadgeVariant('WATCH')).toBe('warning');
    expect(stateBadgeVariant('BUY')).toBe('success');
    expect(stateBadgeVariant('HOLD')).toBe('info');
    expect(stateBadgeVariant('TAKE_PARTIAL_PROFIT')).toBe('info');
    expect(stateBadgeVariant('SELL')).toBe('success');
    expect(stateBadgeVariant('STOP_HIT')).toBe('destructive');
    expect(stateBadgeVariant('DOWNGRADED')).toBe('warning');
    expect(stateBadgeVariant('EXPIRED')).toBe('muted');
  });

  it('handles null/unknown as muted', () => {
    expect(stateBadgeVariant(null)).toBe('muted');
    expect(stateBadgeVariant('UNKNOWN')).toBe('muted');
  });
});

describe('stateBadgeLabel', () => {
  it('humanises underscored states', () => {
    expect(stateBadgeLabel('TAKE_PARTIAL_PROFIT')).toBe('Take Partial Profit');
    expect(stateBadgeLabel('STOP_HIT')).toBe('Stop Hit');
    expect(stateBadgeLabel('WATCH')).toBe('Watch');
  });

  it('returns "—" for null', () => {
    expect(stateBadgeLabel(null)).toBe('—');
  });
});
