'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { StockData } from '@/lib/types';
import { getCompanyName } from '@/lib/companyNames';

interface GlobalStockSearchProps {
  stockData: StockData[];
  onSelectTicker: (ticker: string) => void;
  placeholder?: string;
  className?: string;
}

export function GlobalStockSearch({
  stockData,
  onSelectTicker,
  placeholder = 'Search stocks...',
  className = '',
}: GlobalStockSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return stockData
      .filter(
        s =>
          s.ticker.toLowerCase().includes(q) ||
          getCompanyName(s.ticker).toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, stockData]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [query]);

  const handleSelect = useCallback(
    (ticker: string) => {
      setQuery('');
      setIsOpen(false);
      onSelectTicker(ticker);
    },
    [onSelectTicker]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && filtered[highlightIdx]) {
          handleSelect(filtered[highlightIdx].ticker);
        } else if (filtered.length === 1 && filtered[0]) {
          handleSelect(filtered[0].ticker);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          size={15}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="pmp-input pl-9 pr-8 w-full"
          aria-label="Search and navigate to stock analysis"
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            onClick={() => { setQuery(''); setIsOpen(false); inputRef.current?.focus(); }}
            tabIndex={-1}
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {filtered.map((stock, idx) => (
            <button
              key={stock.ticker}
              type="button"
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                idx === highlightIdx
                  ? 'bg-blue-50 dark:bg-blue-900/30'
                  : 'hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(stock.ticker);
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
            >
              <span className="font-bold text-sm text-gray-900 dark:text-white w-14 shrink-0 font-mono">
                {stock.ticker}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">
                {getCompanyName(stock.ticker)}
              </span>
              <span
                className={`text-xs font-semibold tabular-nums shrink-0 ${
                  stock.percentChange >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-500 dark:text-red-400'
                }`}
              >
                {stock.percentChange >= 0 ? '+' : ''}
                {stock.percentChange.toFixed(2)}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
