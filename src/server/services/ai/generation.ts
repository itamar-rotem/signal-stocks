import { buildInitialPrompt, buildUpdatePrompt } from './prompts';
import { parseInitialResponse, parseUpdateResponse } from './response-schemas';
import { deriveConfidence } from './confidence';
import { RATIONALE_DISCLAIMER } from './disclaimer';
import type {
  Rationale,
  RationaleInput,
  StateTransitionInput,
  StateUpdateRationale,
  Confidence,
} from './types';
import type { RationaleProvider } from './anthropic-client';

export async function generateInitialRationale(
  input: RationaleInput,
  provider: RationaleProvider,
  confidenceOverride?: Confidence,
): Promise<Rationale> {
  const { system, user } = buildInitialPrompt(input);
  const text = await provider.generate(system, user);
  const parsed = parseInitialResponse(text);

  const confidence =
    confidenceOverride ??
    deriveConfidence(input.signalScore, input.volumeConfirmed, input.fundamentalScore);

  return {
    summary: parsed.summary,
    fundamentalThesis: parsed.fundamentalThesis,
    technicalContext: parsed.technicalContext,
    targetPrice: parsed.targetPrice,
    stopLoss: parsed.stopLoss,
    riskReward: parsed.riskReward,
    confidence,
    strategyNote: parsed.strategyNote,
    disclaimer: RATIONALE_DISCLAIMER,
  };
}

export async function generateUpdateRationale(
  input: StateTransitionInput,
  provider: RationaleProvider,
): Promise<StateUpdateRationale> {
  const { system, user } = buildUpdatePrompt(input);
  const text = await provider.generate(system, user);
  const parsed = parseUpdateResponse(text);

  return {
    updateText: parsed.updateText,
    disclaimer: RATIONALE_DISCLAIMER,
  };
}
