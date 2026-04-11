import { describe, it, expect, vi } from 'vitest';
import { generateInitialRationale, generateUpdateRationale } from './generation';
import type { RationaleInput, StateTransitionInput } from './types';
import type { RationaleProvider } from './anthropic-client';
import { RATIONALE_DISCLAIMER } from './disclaimer';

const baseInitial: RationaleInput = {
  signalId: 1,
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  signalType: 'SIG-02',
  strength: 'strong',
  volumeConfirmed: true,
  fundamentalScore: 85,
  signalScore: 87,
  currentPrice: 175.5,
  ma150: 168,
  ma200: 165,
  fundamentalMetrics: { grossMargin: 0.45 },
  sector: 'Technology',
  recentBars: [{ date: '2026-03-01', close: 170 }],
};

function stubProvider(response: string): RationaleProvider {
  return { generate: vi.fn().mockResolvedValue(response) };
}

describe('generateInitialRationale', () => {
  it('returns a full Rationale with disclaimer appended', async () => {
    const modelJson = JSON.stringify({
      summary: 'Strong breakout',
      fundamentalThesis: 'Apple margins',
      technicalContext: 'Above MA200',
      targetPriceRationale: '15% upside',
      targetPrice: 200,
      stopLossRationale: '5% below MA200',
      stopLoss: 157,
      riskReward: 3,
      strategyNote: 'Scale in',
    });
    const result = await generateInitialRationale(baseInitial, stubProvider(modelJson));
    expect(result.summary).toBe('Strong breakout');
    expect(result.targetPrice).toBe(200);
    expect(result.stopLoss).toBe(157);
    expect(result.disclaimer).toBe(RATIONALE_DISCLAIMER);
    expect(result.confidence).toBe('High');
  });

  it('derives Low confidence when signal score below 60', async () => {
    const modelJson = JSON.stringify({
      summary: 's',
      fundamentalThesis: '',
      technicalContext: '',
      targetPriceRationale: '',
      targetPrice: null,
      stopLossRationale: '',
      stopLoss: null,
      riskReward: null,
      strategyNote: '',
    });
    const input = { ...baseInitial, signalScore: 50 };
    const result = await generateInitialRationale(input, stubProvider(modelJson));
    expect(result.confidence).toBe('Low');
  });

  it('throws on invalid model JSON', async () => {
    await expect(
      generateInitialRationale(baseInitial, stubProvider('not valid json')),
    ).rejects.toThrow();
  });

  it('always overwrites disclaimer even if model tries to inject one', async () => {
    const modelJson = JSON.stringify({
      summary: 'x',
      fundamentalThesis: '',
      technicalContext: '',
      targetPriceRationale: '',
      targetPrice: null,
      stopLossRationale: '',
      stopLoss: null,
      riskReward: null,
      strategyNote: '',
      disclaimer: 'MODEL-GENERATED EVIL',
    });
    const result = await generateInitialRationale(baseInitial, stubProvider(modelJson));
    expect(result.disclaimer).toBe(RATIONALE_DISCLAIMER);
    expect(result.disclaimer).not.toContain('EVIL');
  });
});

describe('generateUpdateRationale', () => {
  const updateInput: StateTransitionInput = {
    signalId: 1,
    ticker: 'AAPL',
    previousState: 'BUY',
    newState: 'HOLD',
    previousRationale: 'prev',
    triggerReason: 'followthrough',
    currentPrice: 180,
    targetPrice: 200,
    stopLoss: 165,
  };

  it('returns updateText + disclaimer', async () => {
    const result = await generateUpdateRationale(
      updateInput,
      stubProvider('{"updateText":"Price held above MA200."}'),
    );
    expect(result.updateText).toBe('Price held above MA200.');
    expect(result.disclaimer).toBe(RATIONALE_DISCLAIMER);
  });
});
