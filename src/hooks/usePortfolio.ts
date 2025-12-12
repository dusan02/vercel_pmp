'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { StockData } from '@/lib/types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '@/lib/utils/safeStorage';

const PORTFOLIO_STORAGE_KEY = 'pmp_portfolio_holdings';

interface UsePortfolioProps {
  stockData?: StockData[];
}

export function usePortfolio(props?: UsePortfolioProps) {
  const stockData = props?.stockData || [];
  const [portfolioHoldings, setPortfolioHoldingsState] = useState<Record<string, number>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load portfolio from localStorage on mount
  useEffect(() => {
    const stored = safeGetItem(PORTFOLIO_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Validate parsed data structure
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Ensure all values are numbers
          const validated: Record<string, number> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && value > 0) {
              validated[key] = value;
            }
          }
          setPortfolioHoldingsState(validated);
        } else {
          console.warn('⚠️ Invalid portfolio format, clearing');
          safeRemoveItem(PORTFOLIO_STORAGE_KEY);
        }
      } catch (parseError) {
        console.error('⚠️ Error parsing portfolio, clearing corrupted data:', parseError);
        safeRemoveItem(PORTFOLIO_STORAGE_KEY);
      }
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever portfolio changes
  const setPortfolioHoldings = useCallback((updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setPortfolioHoldingsState(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      
      // Save to localStorage
      safeSetItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(updated));
      
      return updated;
    });
  }, []);

  const updateQuantity = useCallback((ticker: string, quantity: number) => {
    setPortfolioHoldings(prev => {
      const updated = { ...prev };
      if (quantity > 0) {
        updated[ticker] = quantity;
      } else {
        delete updated[ticker];
      }
      return updated;
    });
  }, [setPortfolioHoldings]);

  const removeStock = useCallback((ticker: string) => {
    setPortfolioHoldings(prev => {
      const updated = { ...prev };
      delete updated[ticker];
      return updated;
    });
  }, [setPortfolioHoldings]);

  const addStock = useCallback((ticker: string, quantity?: number) => {
    setPortfolioHoldings(prev => ({
      ...prev,
      [ticker]: quantity || 1
    }));
  }, [setPortfolioHoldings]);

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
    const portfolioTickers = Object.keys(portfolioHoldings).filter(ticker => (portfolioHoldings[ticker] || 0) > 0);
    
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
