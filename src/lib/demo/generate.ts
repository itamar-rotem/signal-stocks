import type { PriceHistoryRow } from '@/components/charts/chart-data';

// Mulberry32 deterministic PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

interface GenerateOptions {
  seed: number;
  days: number;
  startPrice: number;
  /** Inclusive end date (YYYY-MM-DD). The last row lands exactly on this date. */
  endDate: string;
}

export function generateSyntheticSeries(opts: GenerateOptions): PriceHistoryRow[] {
  const { seed, days, startPrice, endDate } = opts;
  const rng = mulberry32(seed);
  const end = new Date(`${endDate}T00:00:00Z`);
  const rows: PriceHistoryRow[] = [];
  let price = startPrice;

  // Generate closes first so we can compute MA200 cleanly.
  const closes: number[] = [];
  for (let i = 0; i < days; i++) {
    const drift = 0.0003; // slight upward bias
    const vol = 0.018; // daily vol
    const shock = (rng() - 0.5) * 2 * vol + drift;
    price = Math.max(1, price * (1 + shock));
    closes.push(price);
  }

  for (let i = 0; i < days; i++) {
    const date = isoDate(addDays(end, -(days - 1 - i)));
    const close = closes[i];
    const open = i === 0 ? startPrice : closes[i - 1];
    const wiggleHi = 1 + rng() * 0.015;
    const wiggleLo = 1 - rng() * 0.015;
    const high = Math.max(open, close) * wiggleHi;
    const low = Math.min(open, close) * wiggleLo;
    const volume = Math.round(500_000 + rng() * 3_000_000);

    let ma200: string | null = null;
    if (i >= 199) {
      const window = closes.slice(i - 199, i + 1);
      const avg = window.reduce((s, v) => s + v, 0) / window.length;
      ma200 = avg.toFixed(4);
    }

    rows.push({
      date,
      open: open.toFixed(4),
      high: high.toFixed(4),
      low: low.toFixed(4),
      close: close.toFixed(4),
      volume,
      ma200,
    });
  }

  return rows;
}
