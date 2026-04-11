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

export type InitialRationaleResponse = z.infer<typeof InitialRationaleResponseSchema>;

export const UpdateRationaleResponseSchema = z
  .object({
    updateText: z.string(),
  })
  .passthrough();

export type UpdateRationaleResponse = z.infer<typeof UpdateRationaleResponseSchema>;

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
