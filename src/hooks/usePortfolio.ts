'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';
import { useSession } from 'next-auth/react';

const PORTFOLIO_STORAGE_KEY = 'pmp_portfolio_holdings';

interface UsePortfolioProps {
  stockData?: StockData[];
}

export function usePortfolio(props?: UsePortfolioProps) {
  const stockData = props?.stockData || [];
  const [portfolioHoldings, setPortfolioHoldingsState] = useState<Record<string, number>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const { data: session } = useSession();

  // Load portfolio from localStorage on mount
  useEffect(() => {
    const stored = safeGetItem(PORTFOLIO_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const MAX_QUANTITY = 1_000_000;
          const validated: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && isFinite(value) && value >= 0 && !isNaN(value)) {
              // Enforce maximum limit when loading from storage
              // Also handle very large numbers that might be in scientific notation
              const safeValue = value > MAX_QUANTITY ? MAX_QUANTITY : value;
              validated[key] = Math.max(0, Math.min(safeValue, MAX_QUANTITY));
            }
          }
          setPortfolioHoldingsState(validated);
          // Save back if any values were capped
          const needsUpdate = Object.entries(parsed).some(([key, value]) => 
            typeof value === 'number' && value > MAX_QUANTITY
          );
          if (needsUpdate) {
            safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(validated));
          }
        } else {
          safeRemoveItem(PORTFOLIO_STORAGE_KEY);
        }
      } catch (parseError) {
        safeRemoveItem(PORTFOLIO_STORAGE_KEY);
      }
    }
    setIsLoaded(true);
  }, []);

  // Sync with Cloud
  useEffect(() => {
    async function syncPortfolio() {
      if (session?.user?.id && isLoaded) {
        try {
          const localKeys = Object.keys(portfolioHoldings);
          if (localKeys.length > 0) {
            // Sync local to cloud (merge/upload)
            await fetch('/api/user/portfolio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'sync', holdings: portfolioHoldings })
            });
          }

          // Fetch latest from cloud
          const res = await fetch('/api/user/portfolio');
          if (res.ok) {
            const data = await res.json();
            if (data.holdings) {
              // If cloud has data, update local. 
              // Only if cloud has MORE keys or different values?
              // For simplicity, take cloud as truth if it exists, but we just uploaded local, so it should be Superset.
              if (Object.keys(data.holdings).length > 0) {
                setPortfolioHoldingsState(data.holdings);
                safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(data.holdings));
              }
            }
          }
        } catch (e) {
          console.error('Error syncing portfolio:', e);
        }
      }
    }

    // Trigger sync when session or isLoaded changes (and ensure we don't loop infinitely)
    // We only want to run this ONCE per session mount ideally.
    if (session?.user?.id && isLoaded) {
      // Simple debounce or flag could be used, but Effect dependency is okay for now 
      // as long as portfolioHoldings doesn't change causing loop. 
      // Wait, portfolioHoldings IS a dependency if we include it.
      // We omit portfolioHoldings from dependency to run only on mount/session change.
      syncPortfolio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, isLoaded]);

  // Save to localStorage whenever portfolio changes
  const setPortfolioHoldings = useCallback((updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setPortfolioHoldingsState(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateQuantity = useCallback(async (ticker: string, quantity: number) => {
    // Enforce maximum limit of 1,000,000
    const MAX_QUANTITY = 1_000_000;
    const q = (typeof quantity === 'number' && isFinite(quantity) && quantity >= 0) 
      ? Math.min(quantity, MAX_QUANTITY) 
      : 0;
    
    // Optimistic update
    setPortfolioHoldings(prev => {
      const updated = { ...prev };
      updated[ticker] = q;
      return updated;
    });

    if (session?.user?.id) {
      try {
        await fetch('/api/user/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update', ticker, quantity })
        });
      } catch (e) { console.error('Cloud update failed', e); }
    }
  }, [setPortfolioHoldings, session?.user?.id]);

  const removeStock = useCallback(async (ticker: string) => {
    setPortfolioHoldings(prev => {
      const updated = { ...prev };
      delete updated[ticker];
      return updated;
    });

    if (session?.user?.id) {
      try {
        await fetch('/api/user/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove', ticker })
        });
      } catch (e) { console.error('Cloud remove failed', e); }
    }
  }, [setPortfolioHoldings, session?.user?.id]);

  const addStock = useCallback(async (ticker: string, quantity?: number) => {
    const qty = quantity || 1;
    setPortfolioHoldings(prev => ({
      ...prev,
      [ticker]: qty
    }));

    if (session?.user?.id) {
      try {
        await fetch('/api/user/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add', ticker, quantity: qty })
        });
      } catch (e) { console.error('Cloud add failed', e); }
    }
  }, [setPortfolioHoldings, session?.user?.id]);

  // Calculate individual stock value
  const calculateStockValue = useCallback((stock: StockData): number => {
    const quantity = portfolioHoldings[stock.ticker] || 0;
    if (quantity === 0) return 0;
    // Use pre-market price if available and non-zero, otherwise close price
    const currentPrice = stock.currentPrice || stock.closePrice;
    const currentValue = currentPrice * quantity;
    const previousValue = stock.closePrice * quantity;
    // Value change since previous close
    return currentValue - previousValue;
  }, [portfolioHoldings]);

  // Calculate total portfolio value change
  const totalPortfolioValue = useMemo(() => {
    return stockData.reduce((total, stock) => {
      if (portfolioHoldings[stock.ticker]) {
        return total + calculateStockValue(stock);
      }
      return total;
    }, 0);
  }, [stockData, portfolioHoldings, calculateStockValue]);

  // Get portfolio stocks logic (moved from HomePage)
  const portfolioStocks = useMemo(() => {
    // Show rows even for 0 quantity (so user can backspace/edit without the row disappearing).
    const portfolioTickers = Object.keys(portfolioHoldings);

    // Find stocks that we have data for
    const existingStocks = stockData.filter(stock => portfolioTickers.includes(stock.ticker));

    // Find stocks that are in portfolio but missing from data
    const missingTickers = portfolioTickers.filter(ticker => !stockData.some(s => s.ticker === ticker));

    // Create placeholders for missing stocks
    const placeholderStocks: StockData[] = missingTickers.map(ticker => ({
      ticker,
      currentPrice: 0,
      closePrice: 0,
      percentChange: 0,
      marketCap: 0,
      marketCapDiff: 0,
      lastUpdated: new Date().toISOString(),
      logoUrl: `/logos/${ticker.toLowerCase()}-32.webp`,
      companyName: '',
      sector: '',
      industry: ''
    }));

    // Combine and ensure logoUrl exists
    return [...existingStocks, ...placeholderStocks].map(stock => ({
      ...stock,
      logoUrl: stock.logoUrl || `/logos/${stock.ticker.toLowerCase()}-32.webp`
    }));
  }, [portfolioHoldings, stockData]);

  return {
    portfolioHoldings,
    setPortfolioHoldings,
    updateQuantity,
    removeStock,
    addStock,
    isLoaded,
    calculateStockValue, // New
    totalPortfolioValue, // New
    portfolioStocks // New
  };
}
