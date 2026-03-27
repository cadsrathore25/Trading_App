/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  DollarSign, 
  History, 
  Settings, 
  Play, 
  Square,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Monitor
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

import { datafeed } from './services/datafeedService';
import { TradingEngine } from './services/tradingService';
import { analyzeChartFrame } from './services/geminiService';
import { Trade, Signal, SignalType } from './types';
import { cn } from './lib/utils';

const YOUTUBE_URL = "https://www.youtube.com/watch?v=-ps7V40GrA4";

export default function App() {
  const [engine] = useState(() => new TradingEngine());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [balance, setBalance] = useState(10000);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceSource, setPriceSource] = useState<'Yahoo Finance' | 'Binance' | 'Datafeed'>('Datafeed');
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);
  const [pnlHistory, setPnlHistory] = useState<{ time: string; pnl: number }[]>([]);

  // Initial Price Fetching & Subscription
  useEffect(() => {
    let isSubscribed = true;

    const fetchInitialPrice = async () => {
      try {
        const bars = await datafeed.getBars('XAUUSD', '1', Math.floor(Date.now() / 1000) - 3600, Math.floor(Date.now() / 1000));
        if (bars.length > 0 && isSubscribed) {
          const price = bars[bars.length - 1].close;
          setCurrentPrice(price);
          setPriceSource('Datafeed');
          engine.updateMarket(price);
          setTrades(engine.getTrades());
          setBalance(engine.getBalance());
        }
      } catch (error) {
        console.error("Failed to fetch initial price:", error);
      }
    };

    fetchInitialPrice();

    // Subscribe to real-time updates
    datafeed.subscribeBars('XAUUSD', '1', (bar) => {
      if (isSubscribed) {
        setCurrentPrice(bar.close);
        setPriceSource('Datafeed');
        engine.updateMarket(bar.close);
        setTrades(engine.getTrades());
        setBalance(engine.getBalance());
      }
    }, 'app-subscriber');

    return () => {
      isSubscribed = false;
      datafeed.unsubscribeBars('app-subscriber');
    };
  }, [engine]);

  // TradingView Ticker Widget Injection
  useEffect(() => {
    const container = document.getElementById('tv-ticker-container');
    if (!container) return;
    
    // Clear any existing content first
    container.innerHTML = '';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify({
      "symbols": [
        { "proName": "FOREXCOM:SPX500", "title": "S&P 500" },
        { "proName": "FOREXCOM:NSXUSD", "title": "US 100" },
        { "proName": "FX_IDC:EURUSD", "title": "EUR/USD" },
        { "proName": "BITSTAMP:BTCUSD", "title": "Bitcoin" },
        { "proName": "BITSTAMP:ETHUSD", "title": "Ethereum" },
        { "proName": "OANDA:XAUUSD", "title": "Gold" }
      ],
      "showSymbolLogo": true,
      "colorTheme": "dark",
      "isTransparent": true,
      "displayMode": "adaptive",
      "locale": "en"
    });
    
    container.appendChild(script);

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  // Update P&L history for the chart
  useEffect(() => {
    const interval = setInterval(() => {
      const openTrades = engine.getTrades().filter(t => t.status === 'OPEN');
      const totalPnL = openTrades.reduce((acc, t) => acc + t.pnl, 0);
      setPnlHistory(prev => [...prev.slice(-20), { 
        time: format(new Date(), 'HH:mm:ss'), 
        pnl: totalPnL 
      }]);
    }, 2000);
    return () => clearInterval(interval);
  }, [engine]);

  const handleManualSignal = (type: SignalType) => {
    const signal: Signal = {
      type,
      price: currentPrice,
      confidence: 1.0,
      timestamp: new Date()
    };
    setSignals(prev => [signal, ...prev].slice(0, 10));
    engine.processSignal(signal, currentPrice);
    setTrades(engine.getTrades());
  };

  const [isAutoAnalyzing, setIsAutoAnalyzing] = useState(false);
  const [autoAnalyzeInterval, setAutoAnalyzeInterval] = useState(30); // seconds
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScreenShared, setIsScreenShared] = useState(false);
  const [lastScreenshot, setLastScreenshot] = useState<string | null>(null);

  // Refs to avoid resetting the auto-analysis interval
  const currentPriceRef = useRef(currentPrice);
  const isAutoTradingRef = useRef(isAutoTrading);
  const lastSignalTypeRef = useRef<SignalType | null>(null);

  useEffect(() => {
    currentPriceRef.current = currentPrice;
  }, [currentPrice]);

  useEffect(() => {
    isAutoTradingRef.current = isAutoTrading;
  }, [isAutoTrading]);

  // WORKAROUND: Use Screen Capture API to bypass CORS and get the actual pixels
  const startScreenShare = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsScreenShared(true);
        stream.getVideoTracks()[0].onended = () => {
          setIsScreenShared(false);
          setLastScreenshot(null);
        };
        return true;
      }
    } catch (err) {
      console.error("Error sharing screen:", err);
    }
    return false;
  };

  // ROI-based change detection
  const previousRoiRef = useRef<ImageData | null>(null);

  // Helper to calculate pixel difference
  const hasSignificantChange = (roiData: ImageData, prevRoiData: ImageData | null): boolean => {
    if (!prevRoiData) return true;
    
    let diff = 0;
    const data = roiData.data;
    const prevData = prevRoiData.data;
    
    // Sample every 5th pixel for higher sensitivity
    for (let i = 0; i < data.length; i += 20) {
      diff += Math.abs(data[i] - prevData[i]) + 
              Math.abs(data[i+1] - prevData[i+1]) + 
              Math.abs(data[i+2] - prevData[i+2]);
    }
    
    // Lowered threshold to be more sensitive to small signal icons
    return diff > 20000;
  };

  // Background script to capture frames and analyze
  useEffect(() => {
    if (!isAutoAnalyzing || !isScreenShared) return;

    const interval = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // 1. Take the screenshot of the background video stream
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // 2. Define ROI (Right-most 15% of the chart, focusing on signal area)
      const roiWidth = Math.floor(canvas.width * 0.15);
      const roiHeight = canvas.height;
      const roiX = canvas.width - roiWidth;
      
      const roiData = ctx.getImageData(roiX, 0, roiWidth, roiHeight);
      
      // 3. Detect change
      if (!hasSignificantChange(roiData, previousRoiRef.current)) {
        return; // No significant change, skip analysis
      }
      
      // Update previous ROI
      previousRoiRef.current = roiData;
      
      // Capture full image for AI analysis
      const base64Image = canvas.toDataURL('image/jpeg', 0.8);
      setLastScreenshot(base64Image);
      setLastAnalysis("Analyzing captured screenshot with Gemini AI...");
      
      try {
        // 4. Send the screenshot file to the AI for analysis
        const signal = await analyzeChartFrame(base64Image);
        if (signal) {
          // Check if the signal changed from the last recorded one
          if (lastSignalTypeRef.current !== signal.type) {
            lastSignalTypeRef.current = signal.type;
            
            setSignals(prev => [signal, ...prev].slice(0, 10));
            
            if (isAutoTradingRef.current) {
              engine.processSignal(signal, currentPriceRef.current);
              setTrades(engine.getTrades());
              setBalance(engine.getBalance());
            }
            setLastAnalysis(`New Signal Detected: ${signal.type} at ${signal.price || currentPriceRef.current}`);
          } else {
            setLastAnalysis(`Signal unchanged: ${signal.type}`);
          }
        } else {
          setLastAnalysis("No clear signal detected.");
        }
      } catch (err) {
        console.error(err);
        setLastAnalysis("Analysis failed.");
      }
    }, autoAnalyzeInterval * 1000);

    return () => clearInterval(interval);
  }, [isAutoAnalyzing, isScreenShared, engine, autoAnalyzeInterval]);

  const activeTrades = trades.filter(t => t.status === 'OPEN');
  const totalPnL = activeTrades.reduce((acc, t) => acc + t.pnl, 0);

  // Determine Trade Status
  const getTradeStatus = () => {
    if (activeTrades.length === 0) return "WAITING FOR TRADE";
    const trade = activeTrades[0];
    return trade.type === 'LONG' ? "LONG POSITION" : "SHORT POSITION";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-orange-500/30">
      {/* TradingView Ticker Tape */}
      <div id="tv-ticker-container" className="tradingview-widget-container h-10 border-b border-white/10 bg-black/50 overflow-hidden" />

      {/* Status Bar */}
      <div className="bg-orange-500 text-black py-1 px-6 flex justify-between items-center text-[10px] font-bold tracking-widest uppercase">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Activity size={12} />
            Status: {getTradeStatus()}
          </span>
          <span className="flex items-center gap-1">
            <DollarSign size={12} />
            Balance: ${balance.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Auto-Scan: {isAutoAnalyzing ? "ON" : "OFF"}</span>
          <span>Algo: {isAutoTrading ? "ACTIVE" : "INACTIVE"}</span>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center shadow-lg shadow-orange-500/20">
              <TrendingUp className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">GOLD SIGNAL <span className="text-orange-500">ALGO</span></h1>
              <div className="flex items-center gap-4 text-[10px] text-white/40 uppercase tracking-widest font-mono">
                <span className="flex items-center gap-2">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live Market Feed
                </span>
                <span className={cn(
                  "flex items-center gap-2",
                  isScreenShared ? "text-green-500" : "text-red-500"
                )}>
                  <span className={cn("flex h-1.5 w-1.5 rounded-full", isScreenShared ? "bg-green-500 animate-pulse" : "bg-red-500")} />
                  {isScreenShared ? "Monitoring Active" : "Monitoring Inactive"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">Account Balance</span>
              <span className="text-xl font-mono font-bold text-orange-400">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <button 
              onClick={async () => {
                if (!isScreenShared) {
                  const shared = await startScreenShare();
                  if (!shared) {
                    alert("Please select a window to start monitoring.");
                    return;
                  }
                }
                setIsAutoTrading(!isAutoTrading);
              }}
              className={cn(
                "flex items-center gap-2 px-6 py-2.5 rounded-full font-bold transition-all active:scale-95",
                isAutoTrading 
                  ? "bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20" 
                  : "bg-orange-500 text-black hover:bg-orange-400 shadow-lg shadow-orange-500/20"
              )}
            >
              {isAutoTrading ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {isAutoTrading ? "STOP ALGO" : "START ALGO"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 grid grid-cols-12 gap-6">
        {/* Left Column: Video & Market Control */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Screen Share: The Signal Source */}
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl group flex items-center justify-center">
            {!isScreenShared ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                  <Monitor size={24} className="text-white/40" />
                </div>
                <p className="text-sm text-white/60">Select the video window to monitor</p>
                <p className="text-xs text-white/40 max-w-sm mx-auto mb-4">
                  *Browser security prevents direct screenshots of video. Click below to give the app permission to capture the video window in the background.
                </p>
                <button 
                  onClick={startScreenShare}
                  className="px-6 py-2 bg-orange-500 text-black font-bold rounded-full hover:bg-orange-400 transition-colors"
                >
                  SELECT VIDEO WINDOW
                </button>
              </div>
            ) : lastScreenshot ? (
              <>
                <img 
                  src={lastScreenshot} 
                  alt="Last Capture" 
                  className="absolute inset-0 w-full h-full object-contain" 
                />
                <div className="absolute top-4 left-4 flex gap-2">
                  <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    LAST CAPTURED SCREENSHOT
                  </div>
                </div>
              </>
            ) : (
              <div className="text-white/60 font-mono text-sm animate-pulse text-center">
                <p>Background capture active.</p>
                <p className="text-xs mt-2">Waiting for first {autoAnalyzeInterval}s read... (Engine must be running)</p>
              </div>
            )}
            
            {/* Hidden video and canvas for capturing */}
            <video ref={videoRef} autoPlay playsInline muted className="opacity-0 absolute inset-0 pointer-events-none w-1 h-1" />
            <canvas ref={canvasRef} className="hidden" />
          </div>

          {/* Real-time Market Price Feed (The "Real" Price) */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Activity size={16} className="text-orange-500" />
                REAL-TIME MARKET FEED (XAUUSD)
              </h3>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">
                  Live Market Feed
                </span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-mono font-bold tracking-tighter text-white">
                  {currentPrice > 0 ? currentPrice.toFixed(2) : "FETCHING..."}
                </span>
                <span className="text-sm font-mono text-green-500 font-bold">+0.42%</span>
              </div>
              <div className="hidden md:block h-16 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlHistory}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="pnl" stroke="#f97316" fillOpacity={1} fill="url(#priceGradient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Real-time Tracking Status & Controls */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Activity size={16} className="text-orange-500" />
                  REAL-TIME TRACKING
                </h3>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    isAutoAnalyzing ? "bg-green-500 animate-pulse" : "bg-white/20"
                  )} />
                  <span className="text-[10px] text-white/40 uppercase tracking-widest font-mono">
                    {isAutoAnalyzing ? "Scanning Active" : "Scanning Paused"}
                  </span>
                </div>
              </div>
              
              <div className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-white/30">Last Scan Status</span>
                  <span className="text-orange-400">{lastAnalysis || "Waiting..."}</span>
                </div>
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-orange-500"
                    animate={{ x: isAutoAnalyzing ? ["-100%", "100%"] : "-100%" }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-white/50">Auto-Tracking Engine</span>
                <button 
                  onClick={() => setIsAutoAnalyzing(!isAutoAnalyzing)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                    isAutoAnalyzing 
                      ? "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20" 
                      : "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20"
                  )}
                >
                  {isAutoAnalyzing ? "Pause Engine" : "Resume Engine"}
                </button>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Settings size={16} className="text-orange-500" />
                MANUAL OVERRIDE
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleManualSignal('LONG')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all group"
                >
                  <ArrowUpRight className="text-green-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Long Trade</span>
                </button>
                <button 
                  onClick={() => handleManualSignal('SHORT')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group"
                >
                  <ArrowDownRight className="text-red-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Short Trade</span>
                </button>
                <button 
                  onClick={() => handleManualSignal('EXIT_LONG')}
                  disabled={!activeTrades.some(t => t.type === 'LONG')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowUpRight className="text-green-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Exit Long</span>
                </button>
                <button 
                  onClick={() => handleManualSignal('EXIT_SHORT')}
                  disabled={!activeTrades.some(t => t.type === 'SHORT')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowDownRight className="text-red-500 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-red-500">Exit Short</span>
                </button>
              </div>
            </div>
          </div>

          {/* Detailed Trade History */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <History size={14} className="text-orange-500" />
                Detailed Trade History
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px] font-mono">
                <thead className="bg-white/5 text-white/30 uppercase tracking-widest">
                  <tr>
                    <th className="p-4">Time / Type</th>
                    <th className="p-4">Entry / Exit</th>
                    <th className="p-4">Max PnL</th>
                    <th className="p-4">Max Loss</th>
                    <th className="p-4 text-right">Booked PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {trades.filter(t => t.status === 'CLOSED').reverse().map(trade => (
                    <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className={cn(
                            "font-bold",
                            trade.type === 'LONG' ? "text-green-500" : "text-red-500"
                          )}>{trade.type}</span>
                          <span className="text-white/20">{format(trade.entryTime, 'HH:mm:ss')}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span>E: {trade.entryPrice.toFixed(2)}</span>
                          <span className="text-white/40">X: {trade.currentPrice.toFixed(2)}</span>
                        </div>
                      </td>
                      <td className="p-4 text-green-500/60">+{trade.maxPnLReached.toFixed(2)}</td>
                      <td className="p-4 text-red-500/60">{trade.maxLossReached.toFixed(2)}</td>
                      <td className="p-4 text-right font-bold">
                        <span className={trade.pnlBooked >= 0 ? "text-green-500" : "text-red-500"}>
                          {trade.pnlBooked >= 0 ? '+' : ''}{trade.pnlBooked.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {trades.filter(t => t.status === 'CLOSED').length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-white/20 uppercase tracking-widest">
                        No closed trades yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Stats & Trades */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Market Status */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse bg-green-500`} />
                <span className="text-xs font-bold uppercase tracking-widest text-white/60">
                  XAUUSD LIVE ({priceSource} Feed)
                </span>
              </div>
              <span className="text-xs font-mono text-white/40">{format(new Date(), 'MMM dd, HH:mm:ss')}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-mono font-bold tracking-tighter">
                {currentPrice > 0 ? currentPrice.toFixed(2) : "LOADING..."}
              </span>
              {currentPrice > 0 && <span className="text-xs font-mono text-green-500">+0.42%</span>}
            </div>
            
            <div className="mt-6 h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={pnlHistory}>
                  <defs>
                    <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="pnl" stroke="#f97316" fillOpacity={1} fill="url(#colorPnl)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Active Positions */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Activity size={14} className="text-orange-500" />
                Active Trades
              </h3>
              <span className={cn(
                "text-xs font-mono font-bold",
                totalPnL >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
              </span>
            </div>
            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
              <AnimatePresence mode="popLayout">
                {activeTrades.length === 0 ? (
                  <div className="p-12 flex flex-col items-center justify-center text-white/20 gap-2">
                    <History size={32} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">No Open Positions</span>
                  </div>
                ) : (
                  activeTrades.map(trade => (
                    <motion.div 
                      key={trade.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="p-4 space-y-3 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                            trade.type === 'LONG' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                          )}>
                            {trade.type}
                          </span>
                          <span className="text-[10px] font-mono text-white/40">#{trade.id}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-xs font-mono font-bold transition-colors duration-200",
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                          </span>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-orange-500 animate-pulse">LIVE</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-[10px] font-mono">
                        <div>
                          <p className="text-white/30 uppercase mb-1">Entry</p>
                          <p className="text-white/80">{trade.entryPrice.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white/30 uppercase mb-1">Stop Loss</p>
                          <p className="text-red-500/80">{trade.stopLoss.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase mb-1">Max PnL</p>
                          <p className="text-green-500/80">+{trade.maxPnLReached.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white/30 uppercase mb-1">Max Loss</p>
                          <p className="text-red-500/80">{trade.maxLossReached.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-white/30 uppercase mb-1">Current PnL</p>
                          <p className={cn(
                            "font-bold",
                            trade.pnl >= 0 ? "text-green-500" : "text-red-500"
                          )}>
                            {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Signal History */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <AlertCircle size={14} className="text-orange-500" />
                Signal Log
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {signals.length === 0 ? (
                <div className="p-8 text-center text-white/20 text-[10px] font-bold uppercase tracking-widest">
                  Waiting for signals...
                </div>
              ) : (
                signals.map((sig, i) => (
                  <div key={i} className="p-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-center gap-3">
                      {sig.type === 'LONG' ? <ArrowUpRight size={14} className="text-green-500" /> : 
                       sig.type === 'SHORT' ? <ArrowDownRight size={14} className="text-red-500" /> :
                       <Square size={12} className="text-white/40" />}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-tight">{sig.type} SIGNAL</p>
                        <p className="text-[9px] font-mono text-white/30">{format(sig.timestamp, 'HH:mm:ss')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-mono text-white/60">{sig.price.toFixed(2)}</p>
                      <p className="text-[9px] font-mono text-white/30">{(sig.confidence * 100).toFixed(0)}% Conf.</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer / Status Bar */}
      <footer className="border-t border-white/10 bg-black/50 p-4 mt-12">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-[10px] font-mono text-white/40 uppercase tracking-widest">
          <div className="flex gap-6">
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Engine: Active
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Tracking: Active
            </span>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              Broker: Demo
            </span>
          </div>
          <div>
            &copy; 2026 Gold Signal Algo Trader v1.0
          </div>
        </div>
      </footer>
    </div>
  );
}
