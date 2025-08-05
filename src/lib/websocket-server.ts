import { Server as SocketIOServer } from 'socket.io';
import { getCachedData, setCachedData, getCacheKey } from './redis';
import { getCurrentPrice, getPreviousClose, getSharesOutstanding, computeMarketCap, computeMarketCapDiff, computePercentChange } from './marketCapUtils';

// TOP 50 tickers for real-time updates (most liquid and popular)
const TOP_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
  'V', 'MA', 'JPM', 'WMT', 'UNH', 'JNJ', 'PG', 'HD', 'CVX', 'MRK',
  'ABBV', 'KO', 'PEP', 'BAC', 'COST', 'TMO', 'ACN', 'DHR', 'VZ', 'ADBE',
  'CRM', 'NFLX', 'TXN', 'QCOM', 'NKE', 'PM', 'RTX', 'HON', 'LOW', 'UPS',
  'IBM', 'GS', 'MS', 'CAT', 'DE', 'AXP', 'BKNG', 'GILD', 'ISRG', 'BLK'
];

interface PriceUpdate {
  ticker: string;
  currentPrice: number;
  previousClose: number;
  percentChange: number;
  marketCap: number;
  marketCapDiff: number;
  timestamp: number;
}

interface BatchPriceUpdate {
  updates: PriceUpdate[];
  timestamp: number;
}

class WebSocketPriceServer {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 WebSocket client connected:', socket.id);

      // Send current prices immediately on connection
      this.sendCurrentPrices(socket);

      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);
      });

      socket.on('subscribe', (tickers: string[]) => {
        console.log('📡 Client subscribed to tickers:', tickers);
        // Could implement individual ticker subscriptions here
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  private async sendCurrentPrices(socket: any) {
    try {
      const updates: PriceUpdate[] = [];
      
      // Get cached data for TOP tickers
      for (const ticker of TOP_TICKERS.slice(0, 20)) { // Start with TOP 20 for performance
        const cacheKey = getCacheKey('pmp', ticker, 'stock');
        const cachedData = await getCachedData(cacheKey);
        
        if (cachedData) {
          updates.push({
            ticker: cachedData.ticker,
            currentPrice: cachedData.currentPrice,
            previousClose: cachedData.closePrice,
            percentChange: cachedData.percentChange,
            marketCap: cachedData.marketCap,
            marketCapDiff: cachedData.marketCapDiff,
            timestamp: Date.now()
          });
        }
      }

      if (updates.length > 0) {
        socket.emit('priceUpdate', {
          updates,
          timestamp: Date.now()
        } as BatchPriceUpdate);
        console.log('📡 Sent initial prices for', updates.length, 'tickers');
      }
    } catch (error) {
      console.error('❌ Error sending initial prices:', error);
    }
  }

  public async startRealTimeUpdates() {
    if (this.isRunning) {
      console.log('⚠️ WebSocket updates already running');
      return;
    }

    console.log('🚀 Starting WebSocket real-time price updates for TOP', TOP_TICKERS.length, 'tickers');
    this.isRunning = true;

    this.updateInterval = setInterval(async () => {
      await this.broadcastPriceUpdates();
    }, 10000); // Update every 10 seconds
  }

  public stopRealTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      this.isRunning = false;
      console.log('🛑 Stopped WebSocket real-time updates');
    }
  }

  private async broadcastPriceUpdates() {
    try {
      const updates: PriceUpdate[] = [];
      const apiKey = process.env.POLYGON_API_KEY;

      if (!apiKey) {
        console.error('❌ Polygon API key not configured');
        return;
      }

      // Process TOP tickers in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < TOP_TICKERS.length; i += batchSize) {
        const batch = TOP_TICKERS.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (ticker) => {
          try {
            // Check cache first
            const cacheKey = getCacheKey('pmp', ticker, 'stock');
            const cachedData = await getCachedData(cacheKey);
            
            if (cachedData && this.isDataFresh(cachedData.lastUpdated)) {
              // Use cached data if fresh (less than 30 seconds old)
              updates.push({
                ticker: cachedData.ticker,
                currentPrice: cachedData.currentPrice,
                previousClose: cachedData.closePrice,
                percentChange: cachedData.percentChange,
                marketCap: cachedData.marketCap,
                marketCapDiff: cachedData.marketCapDiff,
                timestamp: Date.now()
              });
            } else {
              // Fetch fresh data from Polygon
              const shares = await getSharesOutstanding(ticker);
              const prevClose = await getPreviousClose(ticker);
              
              const snapshotUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apikey=${apiKey}`;
              const response = await fetch(snapshotUrl, {
                signal: AbortSignal.timeout(3000)
              });
              
              if (response.ok) {
                const snapshotData = await response.json();
                const currentPrice = getCurrentPrice(snapshotData);
                const percentChange = computePercentChange(currentPrice, prevClose);
                const marketCap = computeMarketCap(currentPrice, shares);
                const marketCapDiff = computeMarketCapDiff(currentPrice, prevClose, shares);

                const update: PriceUpdate = {
                  ticker,
                  currentPrice,
                  previousClose: prevClose,
                  percentChange,
                  marketCap,
                  marketCapDiff,
                  timestamp: Date.now()
                };

                updates.push(update);

                // Cache the fresh data
                const stockData = {
                  ...update,
                  closePrice: prevClose,
                  lastUpdated: new Date().toISOString()
                };
                await setCachedData(cacheKey, stockData, 300); // Cache for 5 minutes
              }
            }
          } catch (error) {
            console.error(`❌ Error updating ${ticker}:`, error);
          }
        }));

        // Small delay between batches to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (updates.length > 0) {
        const batchUpdate: BatchPriceUpdate = {
          updates,
          timestamp: Date.now()
        };

        this.io.emit('priceUpdate', batchUpdate);
        console.log(`📡 Broadcasted ${updates.length} price updates`);
      }
    } catch (error) {
      console.error('❌ Error in broadcastPriceUpdates:', error);
    }
  }

  private isDataFresh(lastUpdated: string): boolean {
    const lastUpdateTime = new Date(lastUpdated).getTime();
    const now = Date.now();
    const thirtySeconds = 30 * 1000;
    return (now - lastUpdateTime) < thirtySeconds;
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      connectedClients: this.io.engine.clientsCount,
      topTickers: TOP_TICKERS.length,
      lastUpdate: this.isRunning ? new Date().toISOString() : null
    };
  }
}

export { WebSocketPriceServer, TOP_TICKERS };
export type { PriceUpdate, BatchPriceUpdate }; 