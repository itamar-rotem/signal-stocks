# Phase 6 — AI Rationale Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** For each detected signal, generate a structured AI rationale via Claude Sonnet, append a legal disclaimer server-side, and persist into `signal_rationales`. Support both initial-signal mode and state-transition update mode.

**Architecture:** Pure prompt builders + a thin Anthropic SDK client behind a `RationaleProvider` interface (mockable for tests). Generation service orchestrates: builds prompt → calls provider → validates JSON output → derives confidence → appends disclaimer → returns structured `Rationale` object. A separate persistence layer upserts into `signal_rationales`. CLI re-generates rationales for stored signals.

**Tech Stack:** `@anthropic-ai/sdk`, zod for response validation, Drizzle, Vitest.

---

## Context You Need Before Starting

1. **Read spec Section 6** (`docs/superpowers/specs/2026-04-10-signalstocks-design.md`). Key points: (a) Claude Sonnet, (b) structured JSON output, (c) disclaimer appended server-side NOT from the model, (d) confidence derived from thresholds, (e) prompts as templates in `src/server/services/ai/prompts.ts`.
2. **Reuse Phase 3-5 patterns** — FMP client style (mockable provider interface, schema validation, FmpApiError-style error class) maps directly to Anthropic client.
3. **`signal_rationales` schema** at `src/server/db/schema/signals.ts`: `id, signal_id (FK), summary, fundamental_thesis, technical_context, target_price, stop_loss, risk_reward, confidence (enum Low/Medium/High), strategy_note, disclaimer, created_at, updated_at`. **Note:** `signal_id` is NOT declared unique in the schema — we'll add a unique index in this phase so upserts work. `target_price` and `stop_loss` are numeric (strings at DB boundary).
4. **Install `@anthropic-ai/sdk`**. Current package.json does not include it yet.
5. **No live Anthropic calls during plan execution.** Tests inject a stub `RationaleProvider`.
6. **Disclaimer text** (PRD Section 18, quoted verbatim in spec Section 14):
   > "This analysis is educational only and not financial advice. Past performance does not guarantee future results."
7. **Model identifier:** `claude-sonnet-4-6` — the latest Claude Sonnet model ID.
8. **Branch:** main. Commit per task.

---

## File Structure

New files under `src/server/services/ai/`:

```
types.ts                             # Rationale, RationaleInput, Confidence types
types.test.ts
disclaimer.ts                        # constants + append helper
disclaimer.test.ts
confidence.ts                        # derive confidence from thresholds
confidence.test.ts
prompts.ts                           # buildInitialPrompt, buildUpdatePrompt
prompts.test.ts
response-schemas.ts                  # zod schemas for structured model output
response-schemas.test.ts
anthropic-client.ts                  # AnthropicRationaleClient implementing RationaleProvider
generation.ts                        # orchestrator: input → prompt → provider → validated Rationale
generation.test.ts                   # uses stub provider
persistence.ts                       # upsert Rationale into signal_rationales
cli.ts                               # pnpm generate:rationale [signalId...]
index.ts                             # barrel
```

Modify:

```
package.json                          # add @anthropic-ai/sdk dep + generate:rationale script
src/lib/env.ts                        # add ANTHROPIC_API_KEY
src/server/db/schema/signals.ts       # add unique index on signal_rationales.signal_id
drizzle/000N_*.sql                    # generated migration
CLAUDE.md                             # document ai service
```

---

## Task 1: Install SDK + add env var + schema index

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/server/db/schema/signals.ts`
- Create: `drizzle/0002_*.sql` (generated)

- [ ] **Step 1: Install dependency**

```bash
pnpm add @anthropic-ai/sdk
```

- [ ] **Step 2: Add env var in `src/lib/env.ts`**

Add to `server` block after `FMP_API_KEY`:
```typescript
ANTHROPIC_API_KEY: z.string().min(1).default('missing-anthropic-key'),
```

Add to `runtimeEnv`:
```typescript
ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
```

- [ ] **Step 3: Add unique index on signal_rationales.signal_id**

In `src/server/db/schema/signals.ts`, wrap `signalRationales` with an index config:

```typescript
export const signalRationales = pgTable(
  'signal_rationales',
  {
    // ... existing columns ...
  },
  (table) => ({
    signalIdIdx: uniqueIndex('signal_rationales_signal_id_idx').on(table.signalId),
  }),
);
```

Make sure `uniqueIndex` is imported from `drizzle-orm/pg-core`.

- [ ] **Step 4: Generate migration**

```bash
pnpm drizzle-kit generate
```

Should create `drizzle/0002_*.sql` with `CREATE UNIQUE INDEX ... signal_rationales_signal_id_idx`.

- [ ] **Step 5: Typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/env.ts src/server/db/schema/signals.ts drizzle/
git commit -m "chore(ai): install @anthropic-ai/sdk, add env var, unique index on signal_rationales"
```

---

## Task 2: Types (TDD)

**Files:**
- Create: `src/server/services/ai/types.ts`
- Create: `src/server/services/ai/types.test.ts`

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
export type Confidence = 'Low' | 'Medium' | 'High';

export type GenerationMode = 'initial' | 'update';

export interface RationaleInput {
  signalId: number;
  ticker: string;
  companyName: string;
  signalType: string;
  strength: string;
  volumeConfirmed: boolean;
  fundamentalScore: number | null;
  signalScore: number | null;
  currentPrice: number;
  ma150: number | null;
  ma200: number | null;
  fundamentalMetrics: Record<string, number | null>;
  sector: string | null;
  recentBars: { date: string; close: number }[]; // last 30 days
}

export interface StateTransitionInput {
  signalId: number;
  ticker: string;
  previousState: string;
  newState: string;
  previousRationale: string;
  triggerReason: string;
  currentPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
}

export interface Rationale {
  summary: string;
  fundamentalThesis: string;
  technicalContext: string;
  targetPrice: number | null;
  stopLoss: number | null;
  riskReward: number | null;
  confidence: Confidence;
  strategyNote: string;
  disclaimer: string;
}

export interface StateUpdateRationale {
  updateText: string;
  disclaimer: string;
}
```

- [ ] **Step 4: Run — expect 3 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/types.ts src/server/services/ai/types.test.ts
git commit -m "feat(ai): add Rationale / RationaleInput / Confidence types"
```

---

## Task 3: Disclaimer constants (TDD)

**Files:**
- Create: `src/server/services/ai/disclaimer.ts`
- Create: `src/server/services/ai/disclaimer.test.ts`

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
/**
 * Verbatim text from PRD Section 18 / spec Section 14. Must appear on every
 * AI-generated rationale, regardless of what the model returns. Overwriting
 * (not merging) guarantees the canonical wording can never drift.
 */
export const RATIONALE_DISCLAIMER =
  'This analysis is educational only and not financial advice. Past performance does not guarantee future results.';

export function ensureDisclaimer(_modelOutput: string | undefined): string {
  return RATIONALE_DISCLAIMER;
}
```

- [ ] **Step 4: Run — expect 4 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/disclaimer.ts src/server/services/ai/disclaimer.test.ts
git commit -m "feat(ai): add canonical rationale disclaimer constant + enforcer"
```

---

## Task 4: Confidence derivation (TDD)

**Files:**
- Create: `src/server/services/ai/confidence.ts`
- Create: `src/server/services/ai/confidence.test.ts`

Rule: derive confidence from signal score + volume confirmation + fundamental score (per spec Section 6.2).

- High: signalScore ≥ 80, volumeConfirmed true, fundamentalScore ≥ 70
- Medium: signalScore ≥ 60
- Low: otherwise

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import type { Confidence } from './types';

/**
 * Spec Section 6.2: confidence derived from signal score + volume confirmation
 * + fundamental score thresholds.
 */
export function deriveConfidence(
  signalScore: number | null,
  volumeConfirmed: boolean,
  fundamentalScore: number | null,
): Confidence {
  if (signalScore === null || signalScore < 60) return 'Low';
  if (
    signalScore >= 80 &&
    volumeConfirmed &&
    fundamentalScore !== null &&
    fundamentalScore >= 70
  ) {
    return 'High';
  }
  return 'Medium';
}
```

- [ ] **Step 4: Run — expect 5 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/confidence.ts src/server/services/ai/confidence.test.ts
git commit -m "feat(ai): add confidence derivation from signal/volume/fundamental thresholds"
```

---

## Task 5: Prompt builders (TDD)

**Files:**
- Create: `src/server/services/ai/prompts.ts`
- Create: `src/server/services/ai/prompts.test.ts`

Exports:
- `buildInitialPrompt(input: RationaleInput): { system: string; user: string }`
- `buildUpdatePrompt(input: StateTransitionInput): { system: string; user: string }`

System prompt tells Claude to output strict JSON matching the schema. User prompt contains the structured data.

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
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
```

- [ ] **Step 4: Run — expect 8 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/prompts.ts src/server/services/ai/prompts.test.ts
git commit -m "feat(ai): add initial and update prompt builders"
```

---

## Task 6: Response schemas (TDD)

**Files:**
- Create: `src/server/services/ai/response-schemas.ts`
- Create: `src/server/services/ai/response-schemas.test.ts`

Zod schemas for the JSON the model returns. Use `.passthrough()` so unexpected extras don't fail validation.

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
import { z } from 'zod';

export const InitialRationaleResponseSchema = z
  .object({
    summary: z.string(),
    fundamentalThesis: z.string(),
    technicalContext: z.string(),
    targetPriceRationale: z.string(),
    targetPrice: z.number().nullable(),
    stopLossRationale: z.string(),
    stopLoss: z.number().nullable(),
    riskReward: z.number().nullable(),
    strategyNote: z.string(),
  })
  .passthrough();

export type InitialRationaleResponse = z.infer<
  typeof InitialRationaleResponseSchema
>;

export const UpdateRationaleResponseSchema = z
  .object({
    updateText: z.string(),
  })
  .passthrough();

export type UpdateRationaleResponse = z.infer<
  typeof UpdateRationaleResponseSchema
>;

/**
 * Strip markdown code fences (```json ... ``` or ``` ... ```) if present,
 * then parse as JSON.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

export function parseInitialResponse(text: string): InitialRationaleResponse {
  const json = JSON.parse(stripCodeFences(text));
  return InitialRationaleResponseSchema.parse(json);
}

export function parseUpdateResponse(text: string): UpdateRationaleResponse {
  const json = JSON.parse(stripCodeFences(text));
  return UpdateRationaleResponseSchema.parse(json);
}
```

- [ ] **Step 4: Run — expect 8 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/response-schemas.ts src/server/services/ai/response-schemas.test.ts
git commit -m "feat(ai): add zod schemas for model JSON output with code-fence handling"
```

---

## Task 7: Anthropic client wrapper

**Files:**
- Create: `src/server/services/ai/anthropic-client.ts`

No test for the client itself — mirrors Phase 3 FMP client (which also has no direct test; covered via integration).

- [ ] **Step 1: Implement**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/lib/env';

export class RationaleApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'RationaleApiError';
  }
}

export interface RationaleProvider {
  /**
   * Send a prompt pair to the model and return the raw text of the first
   * content block.
   */
  generate(system: string, user: string): Promise<string>;
}

export const CLAUDE_SONNET_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_MAX_TOKENS = 1500;

export class AnthropicRationaleClient implements RationaleProvider {
  private readonly client: Anthropic;

  constructor(apiKey: string = env.ANTHROPIC_API_KEY) {
    if (!apiKey || apiKey === 'missing-anthropic-key') {
      throw new RationaleApiError(
        'ANTHROPIC_API_KEY is not set. Add it to .env.local before running rationale generation.',
      );
    }
    this.client = new Anthropic({ apiKey });
  }

  async generate(system: string, user: string): Promise<string> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: CLAUDE_SONNET_MODEL,
        max_tokens: DEFAULT_MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }],
      });
    } catch (err) {
      const status =
        err instanceof Anthropic.APIError ? err.status : undefined;
      throw new RationaleApiError(
        `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`,
        status,
      );
    }

    const first = response.content[0];
    if (!first || first.type !== 'text') {
      throw new RationaleApiError(
        `Expected text content block, got ${first?.type ?? 'none'}`,
      );
    }
    return first.text;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/server/services/ai/anthropic-client.ts
git commit -m "feat(ai): add Anthropic client wrapper implementing RationaleProvider"
```

---

## Task 8: Generation orchestrator (TDD with stub provider)

**Files:**
- Create: `src/server/services/ai/generation.ts`
- Create: `src/server/services/ai/generation.test.ts`

Exports:
- `generateInitialRationale(input: RationaleInput, provider: RationaleProvider, confidenceOverride?: Confidence): Promise<Rationale>`
- `generateUpdateRationale(input: StateTransitionInput, provider: RationaleProvider): Promise<StateUpdateRationale>`

Initial flow: build prompt → call provider → `parseInitialResponse` → map to `Rationale` → derive confidence from `input.signalScore, volumeConfirmed, fundamentalScore` (unless override provided) → append disclaimer.

Update flow: build prompt → call provider → `parseUpdateResponse` → append disclaimer.

- [ ] **Step 1: Failing test**

```typescript
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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```typescript
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
```

- [ ] **Step 4: Run — expect 5 PASS**

- [ ] **Step 5: Commit**

```bash
git add src/server/services/ai/generation.ts src/server/services/ai/generation.test.ts
git commit -m "feat(ai): add generation orchestrator with stub-testable provider"
```

---

## Task 9: Persistence

**Files:**
- Create: `src/server/services/ai/persistence.ts`

Exports: `upsertRationale(signalId: number, rationale: Rationale): Promise<void>`.

- [ ] **Step 1: Implement**

```typescript
import { sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { signalRationales } from '@/server/db/schema';
import type { Rationale } from './types';

const toStr = (n: number | null): string | null =>
  n === null ? null : String(n);

export async function upsertRationale(
  signalId: number,
  rationale: Rationale,
): Promise<void> {
  await db
    .insert(signalRationales)
    .values({
      signalId,
      summary: rationale.summary,
      fundamentalThesis: rationale.fundamentalThesis,
      technicalContext: rationale.technicalContext,
      targetPrice: toStr(rationale.targetPrice),
      stopLoss: toStr(rationale.stopLoss),
      riskReward: toStr(rationale.riskReward),
      confidence: rationale.confidence,
      strategyNote: rationale.strategyNote,
      disclaimer: rationale.disclaimer,
    })
    .onConflictDoUpdate({
      target: signalRationales.signalId,
      set: {
        summary: sql`excluded.summary`,
        fundamentalThesis: sql`excluded.fundamental_thesis`,
        technicalContext: sql`excluded.technical_context`,
        targetPrice: sql`excluded.target_price`,
        stopLoss: sql`excluded.stop_loss`,
        riskReward: sql`excluded.risk_reward`,
        confidence: sql`excluded.confidence`,
        strategyNote: sql`excluded.strategy_note`,
        disclaimer: sql`excluded.disclaimer`,
        updatedAt: sql`now()`,
      },
    });
}
```

- [ ] **Step 2: Typecheck** — `pnpm tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/server/services/ai/persistence.ts
git commit -m "feat(ai): add upsertRationale persistence helper"
```

---

## Task 10: CLI + barrel + script + docs + verification + push

**Files:**
- Create: `src/server/services/ai/cli.ts`
- Create: `src/server/services/ai/index.ts`
- Modify: `package.json`
- Modify: `CLAUDE.md`

The CLI loads signals that don't yet have a rationale (or a specific signal by id), assembles a `RationaleInput` from the DB (signal + stock + latest fundamentals + last 30 daily prices), calls `generateInitialRationale(..., new AnthropicRationaleClient())`, and `upsertRationale`s the result. Prints a summary.

- [ ] **Step 1: Barrel `index.ts`**

```typescript
export * from './types';
export * from './disclaimer';
export * from './confidence';
export * from './prompts';
export * from './response-schemas';
export * from './anthropic-client';
export * from './generation';
export * from './persistence';
```

- [ ] **Step 2: CLI `cli.ts`**

```typescript
import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import {
  stocks,
  signals,
  signalRationales,
  fundamentals,
  dailyPrices,
} from '@/server/db/schema';
import { AnthropicRationaleClient } from './anthropic-client';
import { generateInitialRationale } from './generation';
import { upsertRationale } from './persistence';
import type { RationaleInput } from './types';

const PRICE_LOOKBACK = 30;

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const argIds = process.argv.slice(2).map((s) => Number(s)).filter((n) => !Number.isNaN(n));

  // Load signals needing rationale.
  const rows = await db
    .select({
      signalId: signals.id,
      signalType: signals.signalType,
      strength: signals.strength,
      volumeConfirmed: signals.volumeConfirmed,
      fundamentalScore: signals.fundamentalScore,
      signalScore: signals.signalScore,
      stockId: signals.stockId,
      ticker: stocks.ticker,
      name: stocks.name,
      sector: stocks.sector,
    })
    .from(signals)
    .leftJoin(signalRationales, eq(signalRationales.signalId, signals.id))
    .innerJoin(stocks, eq(stocks.id, signals.stockId))
    .where(argIds.length > 0 ? undefined : isNull(signalRationales.id));

  const targets = argIds.length > 0 ? rows.filter((r) => argIds.includes(r.signalId)) : rows;

  if (targets.length === 0) {
    console.log('No signals need rationale.');
    return;
  }

  const provider = new AnthropicRationaleClient();
  console.log(`Generating rationale for ${targets.length} signal(s)...`);

  let ok = 0;
  const errors: { signalId: number; error: string }[] = [];

  for (const t of targets) {
    try {
      // latest fundamentals
      const [latestFund] = await db
        .select()
        .from(fundamentals)
        .where(eq(fundamentals.stockId, t.stockId))
        .orderBy(desc(fundamentals.quarter))
        .limit(1);

      // recent prices
      const priceRows = await db
        .select({
          date: dailyPrices.date,
          close: dailyPrices.close,
          ma150: dailyPrices.ma150,
          ma200: dailyPrices.ma200,
        })
        .from(dailyPrices)
        .where(eq(dailyPrices.stockId, t.stockId))
        .orderBy(desc(dailyPrices.date))
        .limit(PRICE_LOOKBACK);

      if (priceRows.length === 0) {
        errors.push({ signalId: t.signalId, error: 'no price history' });
        continue;
      }
      const recentBars = priceRows
        .slice()
        .reverse()
        .map((r) => ({ date: r.date, close: Number(r.close) }));
      const latestBar = recentBars[recentBars.length - 1];

      const fundamentalMetrics: Record<string, number | null> = latestFund
        ? {
            grossMargin: toNumber(latestFund.grossMargin),
            operatingMargin: toNumber(latestFund.operatingMargin),
            netMargin: toNumber(latestFund.netMargin),
            roe: toNumber(latestFund.roe),
            roic: toNumber(latestFund.roic),
            debtToEquity: toNumber(latestFund.debtToEquity),
            forwardPe: toNumber(latestFund.forwardPe),
          }
        : {};

      const input: RationaleInput = {
        signalId: t.signalId,
        ticker: t.ticker,
        companyName: t.name,
        signalType: t.signalType,
        strength: t.strength,
        volumeConfirmed: t.volumeConfirmed,
        fundamentalScore: toNumber(t.fundamentalScore),
        signalScore: toNumber(t.signalScore),
        currentPrice: latestBar.close,
        ma150: toNumber(priceRows[0].ma150),
        ma200: toNumber(priceRows[0].ma200),
        fundamentalMetrics,
        sector: t.sector,
        recentBars,
      };

      const rationale = await generateInitialRationale(input, provider);
      await upsertRationale(t.signalId, rationale);
      console.log(`  ${t.ticker.padEnd(8)} signal=${t.signalId} confidence=${rationale.confidence}`);
      ok++;
    } catch (err) {
      errors.push({
        signalId: t.signalId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`\n=== Rationale Summary ===`);
  console.log(`Success: ${ok}`);
  if (errors.length > 0) {
    console.log(`Errors:  ${errors.length}`);
    for (const e of errors) console.log(`  signal=${e.signalId}: ${e.error}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Rationale generation failed:', err);
    process.exit(1);
  });
```

- [ ] **Step 3: Add npm script**

In `package.json` after `detect:signals`:
```json
"generate:rationale": "tsx src/server/services/ai/cli.ts"
```

- [ ] **Step 4: Update CLAUDE.md**

Add to "Running Locally" after `pnpm detect:signals`:
```
pnpm generate:rationale    # generate AI rationale for signals (needs ANTHROPIC_API_KEY)
```

Add to "Project Structure" under `services/`:
```
      ai/           Claude client, prompts, rationale generation, persistence
```

Add to "Tech Stack" line near Anthropic: note that `@anthropic-ai/sdk` is installed and wired.

- [ ] **Step 5: Full verification**

```bash
pnpm format
pnpm lint
pnpm test:run
pnpm build
```

All four must pass. Total tests should be ~180.

- [ ] **Step 6: Commit and push**

```bash
git add src/server/services/ai/cli.ts src/server/services/ai/index.ts package.json CLAUDE.md
git commit -m "chore(ai): wire generate:rationale CLI and document Phase 6"
git push origin main
```

---

## Phase 6 Completion Criteria

- [x] Anthropic SDK installed + ANTHROPIC_API_KEY env var wired
- [x] Unique index on `signal_rationales.signal_id` for upserts
- [x] Pure prompt builders (initial + update)
- [x] Zod response schemas with code-fence handling
- [x] Confidence derivation from thresholds
- [x] Canonical disclaimer enforced server-side
- [x] Anthropic client wrapper behind `RationaleProvider` interface
- [x] Generation orchestrator with stub-testable flow
- [x] Persistence with `onConflictDoUpdate`
- [x] CLI: `pnpm generate:rationale [signalId...]`
- [x] Lint/format/test/build clean, pushed

## Out of Scope

- Rate-limited batching (spec Section 6.2) — deferred; current CLI runs sequentially
- Watchlist-specific prompt templates — deferred to Phase 10
- State transition persistence (signalStateLog rows) — handled by Phase 7 recommendations
