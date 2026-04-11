import type { RationaleInput, StateTransitionInput } from './types';

const INITIAL_SYSTEM = `You are a financial analyst writing investment rationale for a retail-investor screener.

Output format: return ONLY a JSON object — no prose, no markdown code fences — with exactly these keys:
{
  "summary": string (2-3 sentences, plain English),
  "fundamentalThesis": string (why the company's fundamentals are strong/weak),
  "technicalContext": string (what the price/MA action is signalling),
  "targetPriceRationale": string (explanation of a reasonable target price),
  "targetPrice": number | null (absolute USD level),
  "stopLossRationale": string,
  "stopLoss": number | null,
  "riskReward": number | null (ratio of upside distance to downside distance),
  "strategyNote": string (entry/sizing/timing guidance, one paragraph)
}

Do NOT include any disclaimer, legal wording, or confidence field — those are appended server-side and must not appear in your output. Do not include fields not listed above. All numeric fields must be numbers (not strings).`;

const UPDATE_SYSTEM = `You are a financial analyst writing a concise update to an existing investment rationale.

Output ONLY a JSON object — no prose, no markdown — with exactly:
{
  "updateText": string (concise explanation of what changed, why, what the user should consider — 2-4 sentences)
}

Do NOT include any disclaimer or legal wording. Do not invent price levels you were not given.`;

function formatMetrics(metrics: Record<string, number | null>): string {
  return Object.entries(metrics)
    .map(([k, v]) => `  ${k}: ${v === null ? 'n/a' : v}`)
    .join('\n');
}

function formatBars(bars: { date: string; close: number }[]): string {
  return bars.map((b) => `  ${b.date}  ${b.close}`).join('\n');
}

export function buildInitialPrompt(input: RationaleInput): {
  system: string;
  user: string;
} {
  const user = `Stock: ${input.ticker} — ${input.companyName}
Sector: ${input.sector ?? 'unknown'}

Signal: ${input.signalType} (strength=${input.strength}, volumeConfirmed=${input.volumeConfirmed})
Signal Score: ${input.signalScore ?? 'n/a'} / 100
Fundamental Score: ${input.fundamentalScore ?? 'n/a'} / 100

Current Price: ${input.currentPrice}
MA150: ${input.ma150 ?? 'n/a'}
MA200: ${input.ma200 ?? 'n/a'}

Fundamental Metrics:
${formatMetrics(input.fundamentalMetrics)}

Recent 30-day price context (most recent last):
${formatBars(input.recentBars)}

Write the JSON rationale now.`;

  return { system: INITIAL_SYSTEM, user };
}

export function buildUpdatePrompt(input: StateTransitionInput): {
  system: string;
  user: string;
} {
  const user = `Stock: ${input.ticker}
State change: ${input.previousState} → ${input.newState}
Trigger: ${input.triggerReason}
Current price: ${input.currentPrice}
Target: ${input.targetPrice ?? 'n/a'}
Stop: ${input.stopLoss ?? 'n/a'}

Previous rationale:
"""
${input.previousRationale}
"""

Write the JSON update now.`;

  return { system: UPDATE_SYSTEM, user };
}
