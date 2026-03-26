export type SignalType = 'BUY' | 'SELL' | 'CLOSE';

export interface Trade {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop: number | null;
  pnl: number;
  maxPnLReached: number;
  maxLossReached: number;
  pnlBooked: number;
  pnlBeingTrailed: number;
  status: 'OPEN' | 'CLOSED';
  entryTime: Date;
  closeTime?: Date;
}

export interface MarketData {
  price: number;
  timestamp: Date;
}

export interface Signal {
  type: SignalType;
  price: number;
  confidence: number;
  timestamp: Date;
}
