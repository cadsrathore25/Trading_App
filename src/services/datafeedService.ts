/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from 'date-fns';

export interface Bar {
  time: number;
  low: number;
  high: number;
  open: number;
  close: number;
  volume?: number;
}

export interface SymbolInfo {
  name: string;
  description: string;
  type: string;
  session: string;
  timezone: string;
  exchange: string;
  minmov: number;
  pricescale: number;
  has_intraday: boolean;
  has_no_volume: boolean;
  supported_resolutions: string[];
  volume_precision: number;
  data_status: string;
}

export class DatafeedService {
  private subscribers: Map<string, (bar: Bar) => void> = new Map();
  private pollInterval: any = null;

  constructor() {
    this.startPolling();
  }

  private startPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    
    // Poll our internal proxy every 2 seconds
    this.pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/price/xauusd');
        if (response.ok) {
          const data = await response.json();
          if (data && data.price) {
            const bar: Bar = {
              time: data.time || Math.floor(Date.now() / 1000),
              open: data.open || data.price,
              high: data.high || data.price,
              low: data.low || data.price,
              close: data.price,
            };
            this.subscribers.forEach(callback => callback(bar));
          }
        }
      } catch (error) {
        // Ignore polling errors
      }
    }, 2000);
  }

  async getBars(symbol: string, resolution: string, from: number, to: number): Promise<Bar[]> {
    // For initial load, we fetch from our proxy to get the latest price and history
    try {
      console.log('[Datafeed] Fetching from /api/price/xauusd');
      const response = await fetch('/api/price/xauusd');
      console.log('[Datafeed] Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        if (data && data.bars && data.bars.length > 0) {
          return data.bars.map((b: any) => ({
            time: b.time,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }));
        } else if (data && data.price) {
          return [{
            time: data.time || Math.floor(Date.now() / 1000),
            open: data.open || data.price,
            high: data.high || data.price,
            low: data.low || data.price,
            close: data.price,
          }];
        }
      } else {
        console.error('[Datafeed] Proxy Fetch Error: Response not ok', response.status);
      }
    } catch (error) {
      console.error('[Datafeed] Proxy Fetch Error Details:', error);
    }
    return [];
  }

  subscribeBars(symbol: string, resolution: string, onRealtimeCallback: (bar: Bar) => void, subscriberUid: string) {
    this.subscribers.set(subscriberUid, onRealtimeCallback);
  }

  unsubscribeBars(subscriberUid: string) {
    this.subscribers.delete(subscriberUid);
  }
}

export const datafeed = new DatafeedService();
