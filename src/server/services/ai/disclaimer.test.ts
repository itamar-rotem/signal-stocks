import { describe, it, expect } from 'vitest';
import { RATIONALE_DISCLAIMER, ensureDisclaimer } from './disclaimer';

describe('RATIONALE_DISCLAIMER', () => {
  it('is the PRD-mandated disclaimer text', () => {
    expect(RATIONALE_DISCLAIMER).toBe(
      'This analysis is educational only and not financial advice. Past performance does not guarantee future results.',
    );
  });
});

describe('ensureDisclaimer', () => {
  it('returns the canonical disclaimer regardless of model output', () => {
    expect(ensureDisclaimer('some random string')).toBe(RATIONALE_DISCLAIMER);
    expect(ensureDisclaimer(undefined)).toBe(RATIONALE_DISCLAIMER);
    expect(ensureDisclaimer('')).toBe(RATIONALE_DISCLAIMER);
  });
});
