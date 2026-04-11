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
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgb(120,120,130)',
      },
      grid: {
        horzLines: { color: 'rgba(120,120,130,0.15)' },
        vertLines: { color: 'rgba(120,120,130,0.07)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, rightOffset: 6 },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#16a34a',
      downColor: '#dc2626',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#dc2626',
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
        color: '#3b82f6',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(
        ma200Series.map((p) => ({ time: p.time as Time, value: p.value })),
      );
    }

    if (markers.length > 0) {
      // lightweight-charts v5: markers are managed via createSeriesMarkers helper
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
