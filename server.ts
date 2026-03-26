import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route to fetch XAU/USD price from Yahoo Finance
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/price/xauusd', async (req, res) => {
    try {
      // We use Yahoo Finance's GC=F ticker for Gold Futures.
      // Investing.com blocks automated requests with Cloudflare, so this is the most reliable institutional alternative.
      const response = await fetch('https://query2.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Yahoo Finance API returned ${response.status}: ${errorText}`);
        throw new Error(`Yahoo Finance API returned ${response.status}`);
      }

      const data = await response.json();
      const result = data.chart.result[0];
      const quote = result.indicators.quote[0];
      
      const closes = quote.close;
      const opens = quote.open;
      const highs = quote.high;
      const lows = quote.low;
      const timestamps = result.timestamp;
      
      let lastValidIndex = -1;
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] !== null) {
          lastValidIndex = i;
          break;
        }
      }

      if (lastValidIndex === -1) {
        throw new Error('No valid price data found');
      }

      const currentPrice = closes[lastValidIndex];
      const time = timestamps[lastValidIndex];

      // Build an array of bars for the chart
      const bars = [];
      for (let i = 0; i <= lastValidIndex; i++) {
        if (closes[i] !== null && opens[i] !== null && highs[i] !== null && lows[i] !== null) {
          bars.push({
            time: timestamps[i],
            open: opens[i],
            high: highs[i],
            low: lows[i],
            close: closes[i]
          });
        }
      }

      res.json({
        price: currentPrice,
        time: time,
        open: opens[lastValidIndex],
        high: highs[lastValidIndex],
        low: lows[lastValidIndex],
        close: closes[lastValidIndex],
        bars: bars
      });
    } catch (error) {
      console.error('Error fetching price:', error);
      res.status(500).json({ error: 'Failed to fetch price' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
