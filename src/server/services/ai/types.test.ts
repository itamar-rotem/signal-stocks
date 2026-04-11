import { describe, it, expect } from 'vitest';
import type {
  Confidence,
  Rationale,
  RationaleInput,
  StateTransitionInput,
  GenerationMode,
} from './types';

describe('AI types', () => {
  it('Confidence union', () => {
    const c: Confidence = 'High';
    expect(c).toBe('High');
  });

  it('Rationale shape', () => {
    const r: Rationale = {
      summary: 'test',
      fundamentalThesis: 'f',
      technicalContext: 't',
      targetPrice: 120,
      stopLoss: 95,
      riskReward: 2.5,
      confidence: 'Medium',
      strategyNote: 's',
      disclaimer: 'd',
    };
    expect(r.confidence).toBe('Medium');
  });

  it('GenerationMode union', () => {
    const m: GenerationMode = 'initial';
    expect(m).toBe('initial');
  });
});
