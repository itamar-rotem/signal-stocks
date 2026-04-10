import { z } from 'zod';

const UniverseEntrySchema = z.object({
  ticker: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Z][A-Z.]*$/, 'Ticker must be uppercase letters with optional dot'),
  name: z.string().min(1),
  exchange: z.enum(['NYSE', 'NASDAQ', 'AMEX']),
  sector: z.string().min(1),
  industry: z.string().min(1),
});

export type UniverseEntry = z.infer<typeof UniverseEntrySchema>;

export function parseUniverse(data: unknown): UniverseEntry[] {
  const entries = z.array(UniverseEntrySchema).parse(data);
  const seen = new Set<string>();
  const result: UniverseEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.ticker)) continue;
    seen.add(entry.ticker);
    result.push(entry);
  }
  return result;
}
