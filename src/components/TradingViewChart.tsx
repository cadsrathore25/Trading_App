/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries, SeriesMarker } from 'lightweight-charts';
import { datafeed, Bar } from '../services/datafeedService';
import { Signal } from '../types';

interface TradingViewChartProps {
  onPriceUpdate?: (price: number) => void;
  signals?: Signal[];
  showSignal?: boolean;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({ onPriceUpdate, signals, showSignal }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    
    // Initial Data Load
    const loadInitialData = async () => {
      const bars = await datafeed.getBars('XAUUSD', '1', Math.floor(Date.now() / 1000) - 86400, Math.floor(Date.now() / 1000));
      const formattedBars: CandlestickData<Time>[] = bars.map(b => ({
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));
      candlestickSeries.setData(formattedBars);
      
      if (formattedBars.length > 0) {
        onPriceUpdate?.(formattedBars[formattedBars.length - 1].close);
      }
    };

    loadInitialData();

    // Real-time Subscription
    datafeed.subscribeBars('XAUUSD', '1', (bar: Bar) => {
      candlestickSeries.update({
        time: bar.time as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
      onPriceUpdate?.(bar.close);
    }, 'chart-subscriber');

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      datafeed.unsubscribeBars('chart-subscriber');
      chart.remove();
    };
  }, []);

  // Handle Signal Markers
  useEffect(() => {
    if (!seriesRef.current) return;

    if (!showSignal || !signals || signals.length === 0) {
      (seriesRef.current as any).setMarkers([]);
      return;
    }

    // Only show the last signal
    const lastSignal = signals[signals.length - 1];
    if (lastSignal.type === 'EXIT_LONG' || lastSignal.type === 'EXIT_SHORT') {
      const series = seriesRef.current as any;
      series.setMarkers([]);
      return;
    }

    // Align timestamp to the minute bucket to match the chart data
    const signalTime = (Math.floor(lastSignal.timestamp.getTime() / 60000) * 60) as Time;

    const marker: SeriesMarker<Time> = {
      time: signalTime,
      position: lastSignal.type === 'LONG' ? 'belowBar' : 'aboveBar',
      color: lastSignal.type === 'LONG' ? '#22c55e' : '#ef4444',
      shape: lastSignal.type === 'LONG' ? 'arrowUp' : 'arrowDown',
      text: lastSignal.type,
    };

    const series = seriesRef.current as any;
    series.setMarkers([marker]);
  }, [signals, showSignal]);

  return <div ref={chartContainerRef} className="w-full h-full" />;
};
