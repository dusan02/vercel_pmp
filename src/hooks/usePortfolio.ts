'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';
import { useSession } from 'next-auth/react';

const PORTFOLIO_STORAGE_KEY = 'pmp_portfolio_holdings';
const COST_BASIS_STORAGE_KEY = 'pmp_portfolio_cost_basis';
const MAX_QUANTITY = 1_000_000;

function sanitizeNumberMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const validated: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && isFinite(value) && value >= 0 && !isNaN(value)) {
      validated[key] = Math.min(value, MAX_QUANTITY);
    }
  }
  return validated;
}

interface UsePortfolioProps {
  stockData?: StockData[];
}

export function usePortfolio(props?: UsePortfolioProps) {
  const stockData = props?.stockData || [];
  const [portfolioHoldings, setPortfolioHoldingsState] = useState<Record<string, number>>({});
  const [costBasis, setCostBasisState] = useState<Record<string, number>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const { data: session } = useSession();

  // Load portfolio from localStorage on mount (or import from ?p= share link)
  useEffect(() => {
    // Share-link import: /portfolio?p=NVDA:10@142.5,AAPL:5
    // Takes precedence over stored data when present, then strips itself.
    let imported = false;
    try {
      const p = new URLSearchParams(window.location.search).get('p');
      if (p) {
        const h: Record<string, number> = {};
        const c: Record<string, number> = {};
        for (const part of p.split(',')) {
          const m = part.trim().match(/^([A-Za-z.]{1,10})(?::([0-9.]+)(?:@([0-9.]+))?)?$/);
          if (!m || !m[1]) continue;
          const t = m[1].toUpperCase();
          h[t] = m[2] ? Math.min(parseFloat(m[2]) || 0, MAX_QUANTITY) : 1;
          if (m[3]) c[t] = Math.min(parseFloat(m[3]) || 0, MAX_QUANTITY);
        }
        if (Object.keys(h).length > 0) {
          setPortfolioHoldingsState(h);
          setCostBasisState(c);
          safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(h));
          safeSetItem(COST_BASIS_STORAGE_KEY, JSON.stringify(c));
          imported = true;
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('p');
        window.history.replaceState(null, '', url.toString());
      }
    } catch { /* malformed share link — fall through to stored data */ }

    if (!imported) {
      try {
        const stored = safeGetItem(PORTFOLIO_STORAGE_KEY);
        const validated = stored ? sanitizeNumberMap(JSON.parse(stored)) : null;
        if (validated) {
          setPortfolioHoldingsState(validated);
          safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(validated));
        } else {
          safeRemoveItem(PORTFOLIO_STORAGE_KEY);
        }
      } catch {
        safeRemoveItem(PORTFOLIO_STORAGE_KEY);
      }
      try {
        const storedCost = safeGetItem(COST_BASIS_STORAGE_KEY);
        const validatedCost = storedCost ? sanitizeNumberMap(JSON.parse(storedCost)) : null;
        if (validatedCost) {
          setCostBasisState(validatedCost);
          safeSetItem(COST_BASIS_STORAGE_KEY, JSON.stringify(validatedCost));
        } else {
          safeRemoveItem(COST_BASIS_STORAGE_KEY);
        }
      } catch {
        safeRemoveItem(COST_BASIS_STORAGE_KEY);
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
              body: JSON.stringify({ action: 'sync', holdings: portfolioHoldings, costBasis })
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
            if (data.details) {
              const cloudCost: Record<string, number> = {};
              for (const [t, d] of Object.entries(data.details as Record<string, { avgPrice?: number | null }>)) {
                if (typeof d?.avgPrice === 'number' && isFinite(d.avgPrice) && d.avgPrice > 0) {
                  cloudCost[t] = Math.min(d.avgPrice, MAX_QUANTITY);
                }
              }
              // Merge: local cost wins (it was just uploaded), cloud fills gaps
              const merged = { ...cloudCost, ...costBasis };
              setCostBasisState(merged);
              safeSetItem(COST_BASIS_STORAGE_KEY, JSON.stringify(merged));
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

  const setCostBasis = useCallback((updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setCostBasisState(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      safeSetItem(COST_BASIS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const updateCostBasis = useCallback(async (ticker: string, avgPrice: number) => {
    const p = (typeof avgPrice === 'number' && isFinite(avgPrice) && avgPrice > 0)
      ? Math.min(avgPrice, MAX_QUANTITY)
      : 0;
    setCostBasis(prev => {
      const updated = { ...prev };
      if (p > 0) updated[ticker] = p;
      else delete updated[ticker];
      return updated;
    });
    if (session?.user?.id) {
      try {
        await fetch('/api/user/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'setCost', ticker, avgPrice: p })
        });
      } catch (e) { console.error('Cloud cost update failed', e); }
    }
  }, [setCostBasis, session?.user?.id]);

  const updateQuantity = useCallback(async (ticker: string, quantity: number) => {
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
    setCostBasis(prev => {
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

  // Calculate total portfolio value for a stock (quantity × current price)
  const calculateTotalStockValue = useCallback((stock: StockData): number => {
    const quantity = portfolioHoldings[stock.ticker] || 0;
    if (quantity === 0) return 0;
    const currentPrice = stock.currentPrice || stock.closePrice;
    return currentPrice * quantity;
  }, [portfolioHoldings]);

  // Calculate daily change for a stock
  // Derives P&L from percentChange (always fresh, computed server-side)
  // instead of closePrice (which may be stale if latestPrevClose wasn't reset)
  // Math: if pct = ((current - ref) / ref) * 100, then P&L = currentValue * pct / (100 + pct)
  const calculateDailyChange = useCallback((stock: StockData): number => {
    const quantity = portfolioHoldings[stock.ticker] || 0;
    if (quantity === 0) return 0;
    const currentPrice = stock.currentPrice || stock.closePrice;
    const pct = stock.percentChange || 0;
    if (pct === 0) return 0;
    const currentValue = currentPrice * quantity;
    return currentValue * (pct / (100 + pct));
  }, [portfolioHoldings]);

  // Calculate total portfolio value (sum of all position values)
  const totalPortfolioValue = useMemo(() => {
    return stockData.reduce((total, stock) => {
      if (portfolioHoldings[stock.ticker]) {
        return total + calculateTotalStockValue(stock);
      }
      return total;
    }, 0);
  }, [stockData, portfolioHoldings, calculateTotalStockValue]);

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
    costBasis,
    updateCostBasis,
    updateQuantity,
    removeStock,
    addStock,
    isLoaded,
    calculateTotalStockValue, // Total portfolio value
    calculateDailyChange, // New: Daily change value
    totalPortfolioValue, // Total daily change
    portfolioStocks
  };
}
