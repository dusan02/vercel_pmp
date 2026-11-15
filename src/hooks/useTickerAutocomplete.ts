'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { StockData } from '@/lib/types';
import { getCompanyName } from '@/lib/companyNames';

export interface TickerSearchResult {
  ticker: string;
  companyName: string;
  currentPrice: number;
  percentChange: number;
  marketCap: number;
  lastPrice?: number | null;
  lastChangePct?: number | null;
  assetType?: string | null;
}

interface RemoteSearchState {
  query: string;
  items: TickerSearchResult[];
}

interface SearchApiItem {
  symbol: string;
  name?: string | null;
  lastPrice?: number | null;
  lastChangePct?: number | null;
  assetType?: string | null;
}

interface UseTickerAutocompleteOptions {
  limit?: number;
  debounceMs?: number;
}

function toSearchResult(stock: StockData): TickerSearchResult {
  return {
    ticker: stock.ticker,
    companyName: stock.companyName || getCompanyName(stock.ticker),
    currentPrice: stock.currentPrice || 0,
    percentChange: stock.percentChange || 0,
    marketCap: stock.marketCap || 0,
    lastPrice: stock.currentPrice || null,
    lastChangePct: stock.percentChange ?? null,
  };
}

/**
 * Combines instant local matching over `allStocks` with debounced `/api/stocks/search`
 * queries so standalone Portfolio/Favorites find any U.S. ticker without loading all 3000 rows up front.
 */
export function useTickerAutocomplete(
  query: string,
  allStocks: StockData[],
  options: UseTickerAutocompleteOptions = {}
): { results: TickerSearchResult[]; isSearching: boolean } {
  const { limit = 10, debounceMs = 150 } = options;
  const trimmed = query.trim();

  const [remoteState, setRemoteState] = useState<RemoteSearchState>({ query: '', items: [] });
  const [searchingQuery, setSearchingQuery] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const localByTicker = useMemo(() => {
    const map = new Map<string, StockData>();
    for (const s of allStocks) {
      map.set(s.ticker.toUpperCase(), s);
    }
    return map;
  }, [allStocks]);

  const localMatches = useMemo(() => {
    if (!trimmed) return [];
    const lower = trimmed.toLowerCase();
    const matched = allStocks.filter(
      (stock) =>
        stock.ticker.toLowerCase().includes(lower) ||
        (stock.companyName || '').toLowerCase().includes(lower) ||
        getCompanyName(stock.ticker).toLowerCase().includes(lower)
    );
    matched.sort((a, b) => {
      const aSym = a.ticker.toLowerCase();
      const bSym = b.ticker.toLowerCase();
      const aExact = aSym === lower ? 0 : aSym.startsWith(lower) ? 1 : 2;
      const bExact = bSym === lower ? 0 : bSym.startsWith(lower) ? 1 : 2;
      if (aExact !== bExact) return aExact - bExact;
      return (b.marketCap || 0) - (a.marketCap || 0);
    });
    return matched.slice(0, limit).map(toSearchResult);
  }, [trimmed, allStocks, limit]);

  useEffect(() => {
    if (!trimmed || typeof fetch !== 'function') {
      setSearchingQuery(null);
      return;
    }

    const controller = new AbortController();
    const requestId = ++reqIdRef.current;
    setSearchingQuery(trimmed);

    const timerId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          if (requestId === reqIdRef.current) setSearchingQuery(null);
          return;
        }
        const json = await res.json();
        if (requestId !== reqIdRef.current) return;

        const apiItems: SearchApiItem[] = Array.isArray(json?.data) ? json.data : [];
        const mapped: TickerSearchResult[] = apiItems.map((item) => {
          const ticker = String(item.symbol || '').toUpperCase();
          return {
            ticker,
            companyName: item.name || getCompanyName(ticker),
            currentPrice: typeof item.lastPrice === 'number' ? item.lastPrice : 0,
            percentChange: typeof item.lastChangePct === 'number' ? item.lastChangePct : 0,
            marketCap: 0,
            lastPrice: item.lastPrice ?? null,
            lastChangePct: item.lastChangePct ?? null,
            assetType: item.assetType ?? null,
          };
        });
        setRemoteState({ query: trimmed, items: mapped });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
      } finally {
        if (requestId === reqIdRef.current) setSearchingQuery(null);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [trimmed, debounceMs]);

  const results = useMemo(() => {
    if (!trimmed) return [];
    const upper = trimmed.toUpperCase();
    const remoteItems = remoteState.query === trimmed ? remoteState.items : [];

    const merged: TickerSearchResult[] = [];
    const seen = new Set<string>();

    const pushItem = (item: TickerSearchResult) => {
      const key = item.ticker.toUpperCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const local = localByTicker.get(key);
      merged.push(
        local
          ? {
              ticker: local.ticker,
              companyName: local.companyName || item.companyName || getCompanyName(local.ticker),
              currentPrice: local.currentPrice || item.currentPrice,
              percentChange: local.percentChange ?? item.percentChange,
              marketCap: local.marketCap || item.marketCap,
              lastPrice: local.currentPrice || item.lastPrice || null,
              lastChangePct: local.percentChange ?? item.lastChangePct ?? null,
              assetType: item.assetType ?? null,
            }
          : item
      );
    };

    // Prioritize exact ticker hit first (whether local or remote), then remote ranking, then remaining local matches
    const exactLocal = localByTicker.get(upper);
    if (exactLocal) pushItem(toSearchResult(exactLocal));
    for (const item of remoteItems) {
      if (item.ticker.toUpperCase() === upper) pushItem(item);
    }
    for (const item of remoteItems) pushItem(item);
    for (const item of localMatches) pushItem(item);

    return merged.slice(0, limit);
  }, [trimmed, remoteState, localByTicker, localMatches, limit]);

  return {
    results,
    isSearching: Boolean(trimmed && searchingQuery === trimmed),
  };
}
