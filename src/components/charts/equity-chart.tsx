'use client';

import { useEffect, useRef } from 'react';
import { createChart, LineSeries, ColorType, type IChartApi, type Time } from 'lightweight-charts';

export interface EquityChartProps {
  data: { month: number; equity: number }[];
  height?: number;
}

// Convert month index (1-12) to a synthetic ISO date string.
// Month 1 starts 12 months before today (2026-04-12), so month 1 = 2025-05-01.
function monthToDate(month: number): string {
  // Anchor: month 1 = 2025-05-01 (12 months before current date 2026-04-12)
  const base = new Date('2025-05-01T00:00:00Z');
  base.setUTCMonth(base.getUTCMonth() + (month - 1));
  return base.toISOString().slice(0, 10);
}

export function EquityChart({ data, height = 280 }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#1e2230' },
        textColor: '#94a3b8',
      },
      grid: {
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
        vertLines: { color: 'rgba(148, 163, 184, 0.05)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 6 },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#22d3ee',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const seriesData = data.map((d) => ({
      time: monthToDate(d.month) as Time,
      value: d.equity,
    }));

    lineSeries.setData(seriesData);
    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
