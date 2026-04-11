import { describe, it, expect } from 'vitest';
import { signalTypeLabel } from './signal-type-label';

describe('signalTypeLabel', () => {
  it('maps each signal code to a human label', () => {
    expect(signalTypeLabel('SIG-01')).toBe('MA200 Approaching');
    expect(signalTypeLabel('SIG-02')).toBe('MA200 Breakout');
    expect(signalTypeLabel('SIG-03')).toBe('MA150 Approaching');
    expect(signalTypeLabel('SIG-04')).toBe('MA150 Breakout');
    expect(signalTypeLabel('SIG-05')).toBe('Dual MA Breakout');
    expect(signalTypeLabel('SIG-06')).toBe('Golden Cross');
    expect(signalTypeLabel('SIG-07')).toBe('Support Bounce');
  });

  it('passes through unknown codes', () => {
    expect(signalTypeLabel('SIG-99')).toBe('SIG-99');
  });
});
