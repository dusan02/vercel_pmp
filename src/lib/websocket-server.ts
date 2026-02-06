/**
 * Consolidated WebSocket Server for real-time price updates
 * Uses Redis Pub/Sub as primary source, with fallback to direct polling
 */

import { Server as SocketIOServer } from 'socket.io';
import { getRedisSubscriber } from './redis/client';
import { PriceUpdate, BatchPriceUpdate, RedisClient } from './types';

// Export types for backward compatibility
export type { PriceUpdate, BatchPriceUpdate };

// TOP 50 tickers for real-time updates (most liquid and popular)
const TOP_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B', 'AVGO', 'LLY',
  'V', 'MA', 'JPM', 'WMT', 'UNH', 'JNJ', 'PG', 'HD', 'CVX', 'MRK',
  'ABBV', 'KO', 'PEP', 'BAC', 'COST', 'TMO', 'ACN', 'DHR', 'VZ', 'ADBE',
  'CRM', 'NFLX', 'TXN', 'QCOM', 'NKE', 'PM', 'RTX', 'HON', 'LOW', 'UPS',
  'IBM', 'GS', 'MS', 'CAT', 'DE', 'AXP', 'BKNG', 'GILD', 'ISRG', 'BLK'
];

interface TickData {
  symbol: string;
  session: 'pre' | 'live' | 'after';
  p: number;
  change: number;
  ts: number;
  source: string;
  quality: string;
}

/**
 * WebSocket Price Server
 * Handles real-time price updates via Redis Pub/Sub or direct polling
 * Uses SHARED Redis subscriber for all instances (optimization)
 */
export class WebSocketPriceServer {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private redisSubscriber: RedisClient | null = null;

  // User favorites tracking (for filtering)
  private userFavorites: Map<string, Set<string>> = new Map(); // socketId -> Set<symbol>
  private readonly MAX_FAVORITES_PER_USER = 50;

  // SHARED subscriber pre všetkých klientov (static)
  private static sharedSubscriber: RedisClient | null = null;
  private static messageQueue: Map<string, TickData> = new Map();
  private static broadcastInterval: NodeJS.Timeout | null = null;
  private static activeInstances: Set<WebSocketPriceServer> = new Set();
  // Track last sent prices to detect changes (diff updates)
  private static lastSentPrices: Map<string, { price: number; ts: number }> = new Map();
  // Dynamic broadcast frequency based on market activity
  private static currentBroadcastInterval = 100; // Start with 100ms
  private static lastChangeTime = Date.now();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupEventHandlers();
    WebSocketPriceServer.activeInstances.add(this);
    this.setupSharedRedisSubscription();
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log('🔌 WebSocket client connected:', socket.id);

      socket.on('subscribeFavorites', (tickers: string[]) => {
        const validTickers = tickers
          .filter(t => typeof t === 'string' && t.length > 0)
          .map(t => t.toUpperCase().trim())
          .slice(0, this.MAX_FAVORITES_PER_USER);

        this.userFavorites.set(socket.id, new Set(validTickers));
        console.log(`📡 User ${socket.id} subscribed to ${validTickers.length} favorites`);
      });

      socket.on('disconnect', () => {
        console.log('🔌 WebSocket client disconnected:', socket.id);
        this.userFavorites.delete(socket.id);
      });

      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });
    });
  }

  private async setupSharedRedisSubscription() {
    // Initialize shared subscriber only once
    if (!WebSocketPriceServer.sharedSubscriber) {
      try {
        WebSocketPriceServer.sharedSubscriber = await getRedisSubscriber();
        if (WebSocketPriceServer.sharedSubscriber) {
          // node-redis v4 requires passing a listener to subscribe(); there is no `message` event like ioredis.
          // Not passing a listener can cause runtime errors and the subscriber will not process messages.
          await WebSocketPriceServer.sharedSubscriber.subscribe(
            'pmp:tick',
            (message: string, channel?: string) => {
              const effectiveChannel = channel ?? 'pmp:tick';
              if (effectiveChannel !== 'pmp:tick') return;
              if (typeof message !== 'string') return;
              try {
                const data: TickData = JSON.parse(message);
                // Queue pre debounce
                WebSocketPriceServer.messageQueue.set(`${data.symbol}:${data.session}`, data);
              } catch (e) {
                console.error('Error parsing Redis message:', e);
              }
            }
          );

          // Dynamic broadcast frequency based on market activity
          const scheduleBroadcast = () => {
            if (WebSocketPriceServer.broadcastInterval) {
              clearInterval(WebSocketPriceServer.broadcastInterval);
            }

            WebSocketPriceServer.broadcastInterval = setInterval(() => {
              if (WebSocketPriceServer.messageQueue.size > 0) {
                const updates = Array.from(
                  WebSocketPriceServer.messageQueue.values()
                );
                WebSocketPriceServer.messageQueue.clear();

                // Broadcast len TOP50 + favorites (z všetkých aktívnych inštancií)
                const topTickers = new Set(TOP_TICKERS);
                const allFavorites = new Set<string>();

                // Zbieraj favorites zo všetkých aktívnych inštancií
                WebSocketPriceServer.activeInstances.forEach(instance => {
                  instance.userFavorites.forEach(favs => {
                    favs.forEach(symbol => allFavorites.add(symbol));
                  });
                });

                const filtered = updates.filter(
                  (u) =>
                    topTickers.has(u.symbol) ||
                    allFavorites.has(u.symbol)
                );

                // Only send changed prices (diff updates)
                const changedUpdates = filtered.filter(update => {
                  const key = `${update.symbol}:${update.session}`;
                  const lastSent = WebSocketPriceServer.lastSentPrices.get(key);

                  // Send if price changed or it's a new ticker
                  if (!lastSent || lastSent.price !== update.p || lastSent.ts < update.ts - 1000) {
                    WebSocketPriceServer.lastSentPrices.set(key, { price: update.p, ts: update.ts });
                    return true;
                  }
                  return false;
                });

                // Adjust broadcast frequency based on activity
                const now = Date.now();
                if (changedUpdates.length > 0) {
                  WebSocketPriceServer.lastChangeTime = now;
                  // High activity: use faster interval (100ms)
                  if (WebSocketPriceServer.currentBroadcastInterval > 100) {
                    WebSocketPriceServer.currentBroadcastInterval = 100;
                    scheduleBroadcast(); // Reschedule with new interval
                  }
                } else {
                  // No changes: slow down (check every 1-2s)
                  const timeSinceLastChange = now - WebSocketPriceServer.lastChangeTime;
                  if (timeSinceLastChange > 5000 && WebSocketPriceServer.currentBroadcastInterval < 2000) {
                    WebSocketPriceServer.currentBroadcastInterval = 2000;
                    scheduleBroadcast(); // Reschedule with new interval
                  }
                }

                if (changedUpdates.length > 0) {
                  // Broadcast do všetkých aktívnych inštancií
                  WebSocketPriceServer.activeInstances.forEach(instance => {
                    const priceUpdates: PriceUpdate[] = changedUpdates.map(data => ({
                      ticker: data.symbol,
                      currentPrice: data.p,
                      previousClose: data.p / (1 + data.change / 100),
                      percentChange: data.change,
                      marketCap: 0,
                      marketCapDiff: 0,
                      timestamp: data.ts
                    }));

                    instance.io.emit('tick', changedUpdates);
                    instance.io.emit('priceUpdate', {
                      updates: priceUpdates,
                      timestamp: Date.now()
                    } as BatchPriceUpdate);
                  });
                }
              }
            }, WebSocketPriceServer.currentBroadcastInterval);
          };

          // Start with initial broadcast schedule
          scheduleBroadcast();

          console.log('✅ Shared Redis subscriber initialized (pmp:tick)');
        }
      } catch (error) {
        console.error('Error setting up shared Redis subscriber:', error);
      }
    }

    this.redisSubscriber = WebSocketPriceServer.sharedSubscriber;
  }

  // setupBroadcastInterval je teraz v setupSharedRedisSubscription (shared)

  public async startRealTimeUpdates() {
    if (this.isRunning) {
      console.log('⚠️ WebSocket updates already running');
      return;
    }

    console.log('🚀 WebSocket real-time updates started (using Redis Pub/Sub)');
    this.isRunning = true;
  }

  public stopRealTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Stopped WebSocket real-time updates');
  }

  public cleanup() {
    this.stopRealTimeUpdates();
    WebSocketPriceServer.activeInstances.delete(this);

    // Cleanup shared subscriber len ak nie sú žiadne aktívne inštancie
    if (WebSocketPriceServer.activeInstances.size === 0) {
      if (WebSocketPriceServer.broadcastInterval) {
        clearInterval(WebSocketPriceServer.broadcastInterval);
        WebSocketPriceServer.broadcastInterval = null;
      }
      if (WebSocketPriceServer.sharedSubscriber) {
        WebSocketPriceServer.sharedSubscriber.unsubscribe('pmp:tick').catch(console.error);
        WebSocketPriceServer.sharedSubscriber = null;
      }
      WebSocketPriceServer.messageQueue.clear();
      console.log('🧹 Cleaned up shared Redis subscriber');
    }
  }
}
