import { describe, it, expect } from 'vitest';
import { buildInitialPrompt, buildUpdatePrompt } from './prompts';
import type { RationaleInput, StateTransitionInput } from './types';

const initialInput: RationaleInput = {
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
  fundamentalMetrics: { grossMargin: 0.45, roe: 1.55 },
  sector: 'Technology',
  recentBars: [
    { date: '2026-03-01', close: 170 },
    { date: '2026-03-02', close: 172 },
  ],
};

const updateInput: StateTransitionInput = {
  signalId: 1,
  ticker: 'AAPL',
  previousState: 'BUY',
  newState: 'HOLD',
  previousRationale: 'Strong breakout with volume.',
  triggerReason: 'Day-after follow-through',
  currentPrice: 178,
  targetPrice: 200,
  stopLoss: 165,
};

describe('buildInitialPrompt', () => {
  it('includes ticker and signal type in user message', () => {
    const { user } = buildInitialPrompt(initialInput);
    expect(user).toContain('AAPL');
    expect(user).toContain('SIG-02');
    expect(user).toContain('Apple Inc.');
  });

  it('system prompt requires JSON output', () => {
    const { system } = buildInitialPrompt(initialInput);
    expect(system).toMatch(/JSON/i);
  });

  it('includes fundamental metrics', () => {
    const { user } = buildInitialPrompt(initialInput);
    expect(user).toContain('grossMargin');
    expect(user).toContain('0.45');
  });

  it('includes recent price context', () => {
    const { user } = buildInitialPrompt(initialInput);
    expect(user).toContain('2026-03-01');
    expect(user).toContain('170');
  });

  it('instructs model NOT to invent disclaimer text', () => {
    const { system } = buildInitialPrompt(initialInput);
    expect(system).toMatch(/disclaimer/i);
  });
});

describe('buildUpdatePrompt', () => {
  it('includes state transition', () => {
    const { user } = buildUpdatePrompt(updateInput);
    expect(user).toContain('BUY');
    expect(user).toContain('HOLD');
  });

  it('includes previous rationale', () => {
    const { user } = buildUpdatePrompt(updateInput);
    expect(user).toContain('Strong breakout');
  });

  it('system prompt specifies concise update', () => {
    const { system } = buildUpdatePrompt(updateInput);
    expect(system).toMatch(/concise|update/i);
  });
});
