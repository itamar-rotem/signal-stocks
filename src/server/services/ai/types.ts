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
