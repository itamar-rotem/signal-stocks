import { env } from '@/lib/env';
import { parseFmpHistorical, type FmpHistoricalResponse } from './schemas';

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export class FmpApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'FmpApiError';
  }
}

export interface MarketDataProvider {
  getHistoricalPrices(ticker: string): Promise<FmpHistoricalResponse>;
}

/**
 * Thin wrapper around FMP's historical-price-full endpoint.
 * Returns parsed, date-ascending historical rows.
 *
 * Throws FmpApiError on HTTP failure, zod validation failure, or missing key.
 */
export class FmpClient implements MarketDataProvider {
  constructor(private readonly apiKey: string = env.FMP_API_KEY) {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      // Defer the throw until a call is attempted — lets the client be
      // constructed in contexts where the key isn't needed (e.g. type-only imports).
    }
  }

  async getHistoricalPrices(ticker: string): Promise<FmpHistoricalResponse> {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      throw new FmpApiError(
        'FMP_API_KEY is not set. Add it to .env.local before running ingestion.',
      );
    }

    const url = `${FMP_BASE_URL}/historical-price-full/${encodeURIComponent(ticker)}?apikey=${encodeURIComponent(this.apiKey)}`;
    let response: Response;
    try {
      response = await fetch(url);
    } catch (err) {
      throw new FmpApiError(
        `Network error fetching ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!response.ok) {
      throw new FmpApiError(`FMP returned ${response.status} for ${ticker}`, response.status);
    }

    const json: unknown = await response.json();
    try {
      return parseFmpHistorical(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
