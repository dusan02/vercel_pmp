'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface Suggestion {
  symbol: string;
  name: string | null;
  lastChangePct: number | null;
}

interface AnalysisStockSearchProps {
  /** When provided, selection stays in-app (e.g. the homepage Analysis tab).
   *  Otherwise navigates to /analysis/[ticker]. */
  onSelect?: (ticker: string) => void;
  placeholder?: string;
  className?: string;
}

/** Ticker search with live autocomplete (symbol prefix + company name). */
export function AnalysisStockSearch({ onSelect, placeholder = 'Search ticker or company…', className = '' }: AnalysisStockSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqIdRef = useRef(0);

  const pick = useCallback((t: string) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    if (onSelect) onSelect(t);
    else router.push(`/analysis/${encodeURIComponent(t)}`);
  }, [onSelect, router]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current;
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (id !== reqIdRef.current) return;
        setResults(Array.isArray(json?.data) ? json.data : []);
        setOpen(true);
        setHighlight(-1);
      } catch { /* keep previous results */ }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results.at(highlight >= 0 ? highlight : 0);
      if (hit) pick(hit.symbol);
      else if (query.trim()) pick(query.trim().toUpperCase()); // raw-ticker fallback
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label="Search stock ticker or company"
        className="w-full h-10 pl-9 pr-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-medium text-gray-900 dark:text-white"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {results.map((s, i) => (
            <button
              key={s.symbol}
              type="button"
              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                i === highlight ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-white/5'
              }`}
              onMouseDown={e => { e.preventDefault(); pick(s.symbol); }}
              onMouseEnter={() => setHighlight(i)}
            >
              <span className="font-bold text-sm text-gray-900 dark:text-white w-16 shrink-0 font-mono">{s.symbol}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">{s.name ?? ''}</span>
              {s.lastChangePct != null && (
                <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                  s.lastChangePct > 0 ? 'text-emerald-600 dark:text-emerald-400'
                  : s.lastChangePct < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
                }`}>
                  {s.lastChangePct > 0 ? '+' : ''}{s.lastChangePct.toFixed(1)}%
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
