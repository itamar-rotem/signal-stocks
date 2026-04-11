import { describe, it, expect } from 'vitest';
import {
  InitialRationaleResponseSchema,
  UpdateRationaleResponseSchema,
  parseInitialResponse,
  parseUpdateResponse,
} from './response-schemas';

describe('InitialRationaleResponseSchema', () => {
  it('accepts a complete rationale', () => {
    const raw = {
      summary: 's',
      fundamentalThesis: 'ft',
      technicalContext: 'tc',
      targetPriceRationale: 'tpr',
      targetPrice: 200,
      stopLossRationale: 'slr',
      stopLoss: 160,
      riskReward: 2.5,
      strategyNote: 'sn',
    };
    const parsed = InitialRationaleResponseSchema.parse(raw);
    expect(parsed.targetPrice).toBe(200);
  });

  it('allows null numeric fields', () => {
    const raw = {
      summary: 's',
      fundamentalThesis: '',
      technicalContext: '',
      targetPriceRationale: '',
      targetPrice: null,
      stopLossRationale: '',
      stopLoss: null,
      riskReward: null,
      strategyNote: '',
    };
    expect(() => InitialRationaleResponseSchema.parse(raw)).not.toThrow();
  });

  it('rejects missing summary', () => {
    expect(() =>
      InitialRationaleResponseSchema.parse({ fundamentalThesis: 'x' }),
    ).toThrow();
  });
});

describe('parseInitialResponse', () => {
  it('parses a JSON string', () => {
    const str = JSON.stringify({
      summary: 's',
      fundamentalThesis: '',
      technicalContext: '',
      targetPriceRationale: '',
      targetPrice: 100,
      stopLossRationale: '',
      stopLoss: 90,
      riskReward: 2,
      strategyNote: '',
    });
    const parsed = parseInitialResponse(str);
    expect(parsed.targetPrice).toBe(100);
  });

  it('handles JSON wrapped in markdown code fences', () => {
    const str =
      '```json\n{"summary":"s","fundamentalThesis":"","technicalContext":"","targetPriceRationale":"","targetPrice":null,"stopLossRationale":"","stopLoss":null,"riskReward":null,"strategyNote":""}\n```';
    const parsed = parseInitialResponse(str);
    expect(parsed.summary).toBe('s');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseInitialResponse('not json')).toThrow();
  });
});

describe('UpdateRationaleResponseSchema', () => {
  it('accepts an updateText-only object', () => {
    expect(
      UpdateRationaleResponseSchema.parse({ updateText: 'changed' }),
    ).toEqual({ updateText: 'changed' });
  });
});

describe('parseUpdateResponse', () => {
  it('parses a JSON string', () => {
    expect(parseUpdateResponse('{"updateText":"x"}')).toEqual({
      updateText: 'x',
    });
  });
});
