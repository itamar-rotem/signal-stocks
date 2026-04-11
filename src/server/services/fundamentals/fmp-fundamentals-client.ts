import { env } from '@/lib/env';
import { FmpApiError } from '../market-data/fmp-client';
import {
  FmpRatiosSchema,
  FmpKeyMetricsSchema,
  FmpIncomeStatementSchema,
  type FmpRatiosEntry,
  type FmpKeyMetricsEntry,
  type FmpIncomeStatementEntry,
} from './fundamentals-schemas';

const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

export interface FundamentalsProvider {
  getRatios(ticker: string): Promise<FmpRatiosEntry[]>;
  getKeyMetrics(ticker: string): Promise<FmpKeyMetricsEntry[]>;
  getIncomeStatement(ticker: string): Promise<FmpIncomeStatementEntry[]>;
}

export class FmpFundamentalsClient implements FundamentalsProvider {
  constructor(private readonly apiKey: string = env.FMP_API_KEY) {}

  private requireKey(): void {
    if (!this.apiKey || this.apiKey === 'missing-fmp-key') {
      throw new FmpApiError(
        'FMP_API_KEY is not set. Add it to .env.local before running fundamentals ingestion.',
      );
    }
  }

  private async fetchJson(url: string, ticker: string): Promise<unknown> {
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
    return response.json();
  }

  async getRatios(ticker: string): Promise<FmpRatiosEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/ratios/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpRatiosSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP ratios response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getKeyMetrics(ticker: string): Promise<FmpKeyMetricsEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/key-metrics/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpKeyMetricsSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP key-metrics response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async getIncomeStatement(ticker: string): Promise<FmpIncomeStatementEntry[]> {
    this.requireKey();
    const url = `${FMP_BASE_URL}/income-statement/${encodeURIComponent(ticker)}?period=quarter&limit=8&apikey=${encodeURIComponent(this.apiKey)}`;
    const json = await this.fetchJson(url, ticker);
    try {
      return FmpIncomeStatementSchema.parse(json);
    } catch (err) {
      throw new FmpApiError(
        `FMP income-statement response failed schema validation for ${ticker}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
