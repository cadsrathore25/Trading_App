/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format } from 'date-fns';

const API_ENDPOINT = 'https://api.kraken.com/0/public';

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
  private socket: WebSocket | null = null;
  private pollInterval: any = null;

  constructor() {
    this.initWebSocket();
    this.startPollingFallback();
  }

  private initWebSocket() {
    try {
      this.socket = new WebSocket('wss://ws.kraken.com');
      
      this.socket.onopen = () => {
        console.log('[WebSocket] Kraken Connected');
        const subRequest = {
          event: 'subscribe',
          pair: ['XAU/USD'],
          subscription: { name: 'ticker' }
        };
        this.socket?.send(JSON.stringify(subRequest));
      };

      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (Array.isArray(data) && data[1] && data[1].c) {
          const price = parseFloat(data[1].c[0]);
          const bar: Bar = {
            time: Math.floor(Date.now() / 1000),
            open: price,
            high: price,
            low: price,
            close: price,
          };
          this.subscribers.forEach(callback => callback(bar));
        }
      };

      this.socket.onclose = () => {
        console.log('[WebSocket] Kraken Disconnected, retrying...');
        setTimeout(() => this.initWebSocket(), 5000);
      };
    } catch (error) {
      console.error('[WebSocket] Kraken Init Error:', error);
    }
  }

  private startPollingFallback() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        try {
          const response = await fetch(`${API_ENDPOINT}/Ticker?pair=XAUUSD`);
          if (response.ok) {
            const data = await response.json();
            const pairKey = Object.keys(data.result)[0];
            const price = parseFloat(data.result[pairKey].c[0]);
            if (!isNaN(price)) {
              const bar: Bar = {
                time: Math.floor(Date.now() / 1000),
                open: price,
                high: price,
                low: price,
                close: price,
              };
              this.subscribers.forEach(callback => callback(bar));
            }
          }
        } catch (error) {
          // Ignore polling errors
        }
      }
    }, 3000);
  }

  async getBars(symbol: string, resolution: string, from: number, to: number): Promise<Bar[]> {
    const url = `${API_ENDPOINT}/OHLC?pair=XAUUSD&interval=1&since=${from}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.error && data.error.length > 0) {
        console.error('[Datafeed] Kraken API Error:', data.error);
        return [];
      }

      const pairKey = Object.keys(data.result).find(key => key !== 'last');
      if (!pairKey) return [];

      return data.result[pairKey].map((d: any) => ({
        time: parseInt(d[0]),
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[6])
      }));
    } catch (error) {
      console.error('[Datafeed] Kraken Fetch Error:', error);
      return [];
    }
  }

  subscribeBars(symbol: string, resolution: string, onRealtimeCallback: (bar: Bar) => void, subscriberUid: string) {
    this.subscribers.set(subscriberUid, onRealtimeCallback);
  }

  unsubscribeBars(subscriberUid: string) {
    this.subscribers.delete(subscriberUid);
  }
}

export const datafeed = new DatafeedService();
