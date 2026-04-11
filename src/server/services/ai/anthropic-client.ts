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
      const status = err instanceof Anthropic.APIError ? err.status : undefined;
      throw new RationaleApiError(
        `Anthropic API call failed: ${err instanceof Error ? err.message : String(err)}`,
        status,
      );
    }

    const first = response.content[0];
    if (!first || first.type !== 'text') {
      throw new RationaleApiError(`Expected text content block, got ${first?.type ?? 'none'}`);
    }
    return first.text;
  }
}
