import { describe, it, expect } from 'vitest';
import { deriveConfidence } from './confidence';

describe('deriveConfidence', () => {
  it('High when signalScore ≥ 80 and volume confirmed and fundamental ≥ 70', () => {
    expect(deriveConfidence(85, true, 75)).toBe('High');
  });

  it('Medium when signalScore ≥ 60 but missing High criteria', () => {
    expect(deriveConfidence(65, true, 75)).toBe('Medium');
    expect(deriveConfidence(85, false, 75)).toBe('Medium');
    expect(deriveConfidence(85, true, 60)).toBe('Medium');
  });

  it('Low when signalScore < 60', () => {
    expect(deriveConfidence(50, true, 75)).toBe('Low');
    expect(deriveConfidence(59, true, 100)).toBe('Low');
  });

  it('Low when signal score is null', () => {
    expect(deriveConfidence(null, true, 75)).toBe('Low');
  });

  it('Medium when fundamentalScore is null but signalScore ≥ 60', () => {
    expect(deriveConfidence(65, true, null)).toBe('Medium');
  });
});
