import { describe, it, expect } from 'vitest';
import { deriveInitialState } from './initial-state';

describe('deriveInitialState', () => {
  it('returns BUY when strong + volume confirmed', () => {
    expect(deriveInitialState('strong', true)).toBe('BUY');
  });

  it('returns BUY when very_strong + volume confirmed', () => {
    expect(deriveInitialState('very_strong', true)).toBe('BUY');
  });

  it('returns WATCH when volume unconfirmed', () => {
    expect(deriveInitialState('strong', false)).toBe('WATCH');
  });

  it('returns WATCH when strength is medium', () => {
    expect(deriveInitialState('medium', true)).toBe('WATCH');
  });
});
