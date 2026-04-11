'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type Time,
} from 'lightweight-charts';
import type { ChartBar, ChartLinePoint, ChartMarker } from './chart-data';

export interface StockChartProps {
  bars: ChartBar[];
  ma200Series: ChartLinePoint[];
  markers: ChartMarker[];
  height?: number;
}

export function StockChart({ bars, ma200Series, markers, height = 360 }: StockChartProps) {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    candleSeries.setData(
      bars.map((b) => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );

    if (ma200Series.length > 0) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: '#22d3ee',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(ma200Series.map((p) => ({ time: p.time as Time, value: p.value })));
    }

    if (markers.length > 0) {
      createSeriesMarkers(
        candleSeries,
        markers.map((m) => ({
          time: m.time as Time,
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        })),
      );
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, ma200Series, markers, height]);

  return <div ref={containerRef} className="w-full" style={{ height }} />;
}
