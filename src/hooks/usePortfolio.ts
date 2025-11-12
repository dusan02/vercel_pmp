'use client';

import { useState, useEffect, useCallback } from 'react';

const PORTFOLIO_STORAGE_KEY = 'pmp_portfolio_holdings';

export function usePortfolio() {
  const [portfolioHoldings, setPortfolioHoldingsState] = useState<Record<string, number>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load portfolio from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          setPortfolioHoldingsState(parsed);
        }
      }
    } catch (error) {
      console.error('Error loading portfolio from localStorage:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage whenever portfolio changes
  const setPortfolioHoldings = useCallback((updater: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => {
    setPortfolioHoldingsState(prev => {
      const updated = typeof updater === 'function' ? updater(prev) : updater;
      
      // Save to localStorage
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(updated));
        } catch (error) {
          console.error('Error saving portfolio to localStorage:', error);
        }
      }
      
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

  return {
    portfolioHoldings,
    setPortfolioHoldings,
    updateQuantity,
    removeStock,
    addStock,
    isLoaded
  };
}

