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
