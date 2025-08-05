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
  
  // New: Dynamic tickers management
  private dynamicTickers: Set<string> = new Set();
  private userTickers: Map<string, Set<string>> = new Map(); // socketId -> Set<ticker>
  private readonly MAX_FAVORITES_PER_USER = 50;
  private readonly MAX_DYNAMIC_TICKERS = 100;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
  }

  // New: Add user favorites tickers
  private addUserTickers(socketId: string, tickers: string[]): void {
    // Validate and limit tickers
    const validTickers = tickers
      .filter(ticker => typeof ticker === 'string' && ticker.length > 0)
      .map(ticker => ticker.toUpperCase())
      .slice(0, this.MAX_FAVORITES_PER_USER);

    if (validTickers.length === 0) {
      console.log('📡 No valid tickers to add for socket:', socketId);
      return;
    }

    // Remove old tickers for this user
    this.removeUserTickers(socketId);

    // Add new tickers
    const userTickerSet = new Set(validTickers);
    this.userTickers.set(socketId, userTickerSet);

    // Add to dynamic tickers (if not already in TOP_TICKERS)
    validTickers.forEach(ticker => {
      if (!TOP_TICKERS.includes(ticker)) {
        this.dynamicTickers.add(ticker);
      }
    });

    console.log(`📡 Added ${validTickers.length} favorites for socket ${socketId}:`, validTickers);
    console.log(`📊 Total dynamic tickers: ${this.dynamicTickers.size}`);
  }

  // New: Remove user favorites tickers
  private removeUserTickers(socketId: string): void {
    const userTickers = this.userTickers.get(socketId);
    if (!userTickers) return;

    // Remove from dynamic tickers if no other user has them
    userTickers.forEach(ticker => {
      if (!TOP_TICKERS.includes(ticker)) {
        let stillInUse = false;
        for (const [otherSocketId, otherTickers] of this.userTickers.entries()) {
          if (otherSocketId !== socketId && otherTickers.has(ticker)) {
            stillInUse = true;
            break;
          }
        }
        if (!stillInUse) {
          this.dynamicTickers.delete(ticker);
        }
      }
    });

    this.userTickers.delete(socketId);
    console.log(`📡 Removed favorites for socket ${socketId}`);
    console.log(`📊 Total dynamic tickers: ${this.dynamicTickers.size}`);
  }

  // New: Get all active tickers (TOP_TICKERS + dynamic favorites)
  private getActiveTickers(): string[] {
    const allTickers = [...TOP_TICKERS, ...this.dynamicTickers];
    return [...new Set(allTickers)]; // Remove duplicates
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 WebSocket client connected:', socket.id);

      // Send current prices immediately on connection
      this.sendCurrentPrices(socket);

      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);
        this.removeUserTickers(socket.id);
      });

      socket.on('subscribe', (tickers: string[]) => {
        console.log('📡 Client subscribed to tickers:', tickers);
        // Could implement individual ticker subscriptions here
      });

      // New: Handle favorites subscription
      socket.on('subscribeFavorites', (tickers: string[]) => {
        console.log('📡 Client subscribed to favorites:', tickers);
        this.addUserTickers(socket.id, tickers);
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

    console.log('🚀 Starting WebSocket real-time price updates for TOP', TOP_TICKERS.length, 'tickers + dynamic favorites');
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

      // Get all active tickers (TOP_TICKERS + dynamic favorites)
      const activeTickers = this.getActiveTickers();
      
      // Process all active tickers in batches for better performance
      const batchSize = 10;
      for (let i = 0; i < activeTickers.length; i += batchSize) {
        const batch = activeTickers.slice(i, i + batchSize);
        
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
      dynamicTickers: this.dynamicTickers.size,
      totalActiveTickers: this.getActiveTickers().length,
      activeUsers: this.userTickers.size,
      lastUpdate: this.isRunning ? new Date().toISOString() : null
    };
  }
}

export { WebSocketPriceServer, TOP_TICKERS };
export type { PriceUpdate, BatchPriceUpdate }; 