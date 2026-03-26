export type SignalType = 'LONG' | 'SHORT' | 'EXIT_LONG' | 'EXIT_SHORT';

export interface Trade {
  id: string;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  pnl: number;
  maxPnLReached: number;
  maxLossReached: number;
  pnlBooked: number;
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
