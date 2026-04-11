import { describe, it, expect } from 'vitest';
import { strengthValue, volumeValue, computeSignalScore } from './composite-score';

describe('strengthValue', () => {
  it('maps strengths to numeric values', () => {
    expect(strengthValue('medium')).toBe(50);
    expect(strengthValue('strong')).toBe(75);
    expect(strengthValue('very_strong')).toBe(100);
  });
});

describe('volumeValue', () => {
  it('returns 100 when confirmed', () => {
    expect(volumeValue(true)).toBe(100);
  });
  it('returns 50 when unconfirmed', () => {
    expect(volumeValue(false)).toBe(50);
  });
});

describe('computeSignalScore', () => {
  it('combines fundamental/technical/volume per spec weights', () => {
    expect(computeSignalScore(100, 'very_strong', true)).toBe(100);
    expect(computeSignalScore(0, 'medium', false)).toBe(25); // 0 + 15 + 10
  });

  it('returns null when fundamental score is null', () => {
    expect(computeSignalScore(null, 'strong', true)).toBeNull();
  });
});
