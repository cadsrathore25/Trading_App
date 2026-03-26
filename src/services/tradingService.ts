import { Trade, Signal, MarketData } from "../types";

export class TradingEngine {
  private trades: Trade[] = [];
  private balance: number = 10000; // Starting with $10k
  private trailingStopDistance: number = 2.0; // $2 movement for trailing stop
  private targetProfitDistance: number = 5.0; // $5 target

  constructor(initialBalance?: number) {
    if (initialBalance) this.balance = initialBalance;
  }

  public processSignal(signal: Signal, currentPrice: number): Trade | null {
    const openTrades = this.trades.filter(t => t.status === 'OPEN');

    if (signal.type === 'CLOSE') {
      openTrades.forEach(t => this.closeTrade(t.id, currentPrice));
      return null;
    }

    // Opposite signal logic: Close existing if opposite signal comes
    if (signal.type === 'BUY') {
      openTrades.filter(t => t.type === 'SHORT').forEach(t => this.closeTrade(t.id, currentPrice));
      if (openTrades.some(t => t.type === 'LONG')) return null; // Already long
      return this.openTrade('LONG', currentPrice);
    }

    if (signal.type === 'SELL') {
      openTrades.filter(t => t.type === 'LONG').forEach(t => this.closeTrade(t.id, currentPrice));
      if (openTrades.some(t => t.type === 'SHORT')) return null; // Already short
      return this.openTrade('SHORT', currentPrice);
    }

    return null;
  }

  private openTrade(type: 'LONG' | 'SHORT', price: number): Trade {
    const stopLoss = type === 'LONG' ? price - 5 : price + 5;
    const takeProfit = type === 'LONG' ? price + 10 : price - 10;
    const quantity = 10;

    const trade: Trade = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      entryPrice: price,
      currentPrice: price,
      quantity,
      stopLoss,
      takeProfit,
      trailingStop: null,
      pnl: 0,
      maxPnLReached: 0,
      maxLossReached: 0,
      pnlBooked: 0,
      pnlBeingTrailed: 0,
      status: 'OPEN',
      entryTime: new Date(),
    };
    this.trades.push(trade);
    return trade;
  }

  public closeTrade(id: string, price: number) {
    const trade = this.trades.find(t => t.id === id);
    if (trade && trade.status === 'OPEN') {
      trade.status = 'CLOSED';
      trade.closeTime = new Date();
      trade.currentPrice = price;
      trade.pnl = this.calculatePnL(trade, price);
      trade.pnlBooked = trade.pnl;
      this.balance += trade.pnl;
    }
  }

  public updateMarket(price: number) {
    this.trades.filter(t => t.status === 'OPEN').forEach(trade => {
      trade.currentPrice = price;
      trade.pnl = this.calculatePnL(trade, price);

      // Track max PnL and max loss
      if (trade.pnl > trade.maxPnLReached) trade.maxPnLReached = trade.pnl;
      if (trade.pnl < trade.maxLossReached) trade.maxLossReached = trade.pnl;

      // Trailing Stop Logic
      if (trade.type === 'LONG') {
        // If price moves up, move SL up
        const newSL = price - this.trailingStopDistance;
        if (newSL > trade.stopLoss) {
          trade.stopLoss = newSL;
          trade.trailingStop = newSL;
        }
        
        // Calculate PnL being trailed (PnL at the current SL)
        trade.pnlBeingTrailed = (trade.stopLoss - trade.entryPrice) * trade.quantity;

        // Check SL
        if (price <= trade.stopLoss) this.closeTrade(trade.id, price);
        // Check TP
        if (price >= trade.takeProfit) this.closeTrade(trade.id, price);
      } else {
        // If price moves down, move SL down
        const newSL = price + this.trailingStopDistance;
        if (newSL < trade.stopLoss) {
          trade.stopLoss = newSL;
          trade.trailingStop = newSL;
        }

        // Calculate PnL being trailed (PnL at the current SL)
        trade.pnlBeingTrailed = (trade.entryPrice - trade.stopLoss) * trade.quantity;

        // Check SL
        if (price >= trade.stopLoss) this.closeTrade(trade.id, price);
        // Check TP
        if (price <= trade.takeProfit) this.closeTrade(trade.id, price);
      }
    });
  }

  private calculatePnL(trade: Trade, price: number): number {
    const diff = trade.type === 'LONG' ? price - trade.entryPrice : trade.entryPrice - price;
    return diff * trade.quantity;
  }

  public getTrades() { return [...this.trades]; }
  public getBalance() { return this.balance; }
}
