import { prisma } from './prisma';

// Database helper functions using Prisma
export const dbHelpers = {
  // Stock management - mostly handled by worker now, but kept for compatibility
  upsertStock: {
    run: async (ticker: string, companyName: string, marketCap: number, sharesOutstanding: number, lastUpdated: string) => {
      try {
        const updatePayload: Parameters<typeof prisma.ticker.upsert>[0]['update'] = {
          updatedAt: new Date(lastUpdated)
        };

        if (typeof sharesOutstanding === 'number' && !Number.isNaN(sharesOutstanding)) {
          updatePayload.sharesOutstanding = sharesOutstanding;
        }

        if (companyName) {
          updatePayload.name = companyName;
        }

        await prisma.ticker.upsert({
          where: { symbol: ticker },
          update: updatePayload,
          create: {
            symbol: ticker,
            name: companyName,
            sharesOutstanding,
            updatedAt: new Date(lastUpdated)
          }
        });
      } catch (error) {
        console.error(`Error upserting stock ${ticker}:`, error);
      }
    }
  },

  getStock: {
    get: async (ticker: string) => {
      try {
        const stock = await prisma.ticker.findUnique({
          where: { symbol: ticker }
        });
        return stock;
      } catch (error) {
        console.error(`Error getting stock ${ticker}:`, error);
        return null;
      }
    }
  },

  getAllStocks: {
    all: async () => {
      try {
        // This might be heavy if we have thousands of stocks, but for now it's fine
        return await prisma.ticker.findMany();
      } catch (error) {
        console.error('Error getting all stocks:', error);
        return [];
      }
    }
  },

  // Price history - handled by worker writing to SessionPrice/DailyRef
  // We map the old SQLite structure to Prisma queries here
  addPriceHistory: {
    run: async (ticker: string, price: number, volume: number, timestamp: string) => {
      // This was used for high-frequency history in SQLite.
      // In Postgres/Prisma, we use SessionPrice for snapshots.
      // We can ignore this or map it if needed, but usually worker handles this.
      // For now, no-op to avoid breaking callers, or log warning.
      // console.warn('addPriceHistory is deprecated. Worker handles data ingestion.');
    }
  },

  getPriceHistory: {
    all: async (ticker: string, limit: number) => {
      try {
        // Map to SessionPrice or DailyRef depending on need. 
        // Assuming we want recent session prices.
        const history = await prisma.sessionPrice.findMany({
          where: { symbol: ticker },
          orderBy: { lastTs: 'desc' },
          take: limit
        });

        return history.map(h => ({
          ticker: h.symbol,
          price: h.lastPrice,
          timestamp: h.lastTs.toISOString(),
          volume: 0 // SessionPrice doesn't have volume, maybe fetch from elsewhere if needed
        }));
      } catch (error) {
        console.error(`Error getting price history for ${ticker}:`, error);
        return [];
      }
    }
  },

  getPriceHistoryRange: {
    all: async (ticker: string, startDate: string, endDate: string) => {
      try {
        const history = await prisma.sessionPrice.findMany({
          where: {
            symbol: ticker,
            lastTs: {
              gte: new Date(startDate),
              lte: new Date(endDate)
            }
          },
          orderBy: { lastTs: 'desc' }
        });

        return history.map(h => ({
          ticker: h.symbol,
          price: h.lastPrice,
          timestamp: h.lastTs.toISOString(),
          volume: 0
        }));
      } catch (error) {
        console.error(`Error getting price history range for ${ticker}:`, error);
        return [];
      }
    }
  },

  // User favorites - mapped to UserFavorite model
  addFavorite: {
    run: async (userId: string, ticker: string) => {
      try {
        await prisma.userFavorite.upsert({
          where: {
            userId_ticker: {
              userId,
              ticker
            }
          },
          update: {},
          create: {
            userId,
            ticker
          }
        });
      } catch (error) {
        console.error(`Error adding favorite ${ticker} for ${userId}:`, error);
      }
    }
  },

  removeFavorite: {
    run: async (userId: string, ticker: string) => {
      try {
        await prisma.userFavorite.delete({
          where: {
            userId_ticker: {
              userId,
              ticker
            }
          }
        });
      } catch (error) {
        // Ignore if not found
      }
    }
  },

  getFavorites: {
    all: async (userId: string) => {
      try {
        return await prisma.userFavorite.findMany({
          where: { userId },
          select: { ticker: true }
        });
      } catch (error) {
        console.error(`Error getting favorites for ${userId}:`, error);
        return [];
      }
    }
  },

  // Alias for getFavorites to match interface
  getUserFavorites: {
    all: async (userId: string) => {
      try {
        return await prisma.userFavorite.findMany({
          where: { userId },
          select: { ticker: true }
        });
      } catch (error) {
        console.error(`Error getting favorites for ${userId}:`, error);
        return [];
      }
    }
  },

  // Analytics functions - simplified or mapped to Prisma
  getTopGainers: {
    all: async () => {
      // This is complex to do purely in Prisma without raw SQL for percentage change calculation
      // if we don't have it pre-calculated.
      // However, SessionPrice has changePct!
      try {
        // Get latest live session prices
        const topGainers = await prisma.sessionPrice.findMany({
          where: { session: 'live' }, // or 'market'
          orderBy: { changePct: 'desc' },
          take: 10,
          include: { ticker: true }
        });

        return topGainers.map(g => ({
          ticker: g.symbol,
          company_name: g.ticker.name,
          market_cap: 0, // Need to fetch or calculate
          current_price: g.lastPrice,
          previous_price: g.lastPrice / (1 + g.changePct / 100)
        }));
      } catch (error) {
        console.error('Error getting top gainers:', error);
        return [];
      }
    }
  },

  getTopLosers: {
    all: async () => {
      try {
        const topLosers = await prisma.sessionPrice.findMany({
          where: { session: 'live' },
          orderBy: { changePct: 'asc' },
          take: 10,
          include: { ticker: true }
        });

        return topLosers.map(l => ({
          ticker: l.symbol,
          company_name: l.ticker.name,
          market_cap: 0,
          current_price: l.lastPrice,
          previous_price: l.lastPrice / (1 + l.changePct / 100)
        }));
      } catch (error) {
        console.error('Error getting top losers:', error);
        return [];
      }
    }
  },

  // Cache status - unused now
  setCacheStatus: {
    run: async (key: string, value: string, updatedAt: string) => { }
  },

  getCacheStatus: {
    get: async (key: string) => { return null; }
  },

  // User management - unused/mocked in auth.ts
  createUser: {
    run: async (id: string, email: string, passwordHash: string, name: string) => { }
  },

  getUserByEmail: {
    get: async (email: string) => { return null; }
  },

  // Session management - unused
  createSession: {
    run: async (id: string, userId: string, expiresAt: string) => { }
  },

  getSession: {
    get: async (id: string) => { return null; }
  },

  deleteSession: {
    run: async (id: string) => { }
  },

  cleanupSessions: {
    run: async () => { }
  }
};

// Transaction support - Prisma handles this internally or via $transaction
export async function runTransaction<T>(fn: () => Promise<T> | T): Promise<T> {
  // Simple wrapper, real transaction support would require passing prisma instance
  return await fn();
}

export function initializeDatabase() {
  console.log('✅ Database initialized (Prisma)');
}

export function closeDatabase() {
  // Prisma manages connection pool
}

export default prisma;