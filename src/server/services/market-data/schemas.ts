import { z } from 'zod';

export const FmpHistoricalEntrySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    open: z.number(),
    high: z.number(),
    low: z.number(),
    close: z.number(),
    volume: z.number().int().nonnegative(),
  })
  .passthrough();

export const FmpHistoricalResponseSchema = z.object({
  symbol: z.string().min(1),
  historical: z.array(FmpHistoricalEntrySchema),
});

export type FmpHistoricalEntry = z.infer<typeof FmpHistoricalEntrySchema>;
export type FmpHistoricalResponse = z.infer<typeof FmpHistoricalResponseSchema>;

/**
 * Parse + normalize an FMP historical-price-full response.
 * FMP returns rows newest-first; we reverse to chronological ascending order,
 * which is required for all downstream MA and slope computation.
 */
export function parseFmpHistorical(raw: unknown): FmpHistoricalResponse {
  const parsed = FmpHistoricalResponseSchema.parse(raw);
  return {
    symbol: parsed.symbol,
    historical: [...parsed.historical].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
