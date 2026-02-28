'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Star, Loader2 } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';

import { StockData } from '@/lib/types';

interface MinimalRow {
    t: string;  // ticker
    p: number;  // price
    c: number;  // changePct
    m: number;  // marketCap
}

interface AddFavoriteSearchProps {
    onToggleFavorite: (ticker: string) => void;
    isFavorite: (ticker: string) => boolean;
    allStocks: StockData[];
}

export function AddFavoriteSearch({ onToggleFavorite, isFavorite, allStocks }: AddFavoriteSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MinimalRow[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Local search functionality (debounced visually, but runs locally)
    useEffect(() => {
        const q = query.trim().toLowerCase();
        if (q.length === 0) {
            setResults([]);
            return;
        }

        const filtered = allStocks.filter(stock =>
            stock.ticker.toLowerCase().includes(q) ||
            getCompanyName(stock.ticker).toLowerCase().includes(q)
        ).slice(0, 6);

        const mappedResults: MinimalRow[] = filtered.map(stock => ({
            t: stock.ticker,
            p: stock.currentPrice || 0,
            c: stock.percentChange || 0,
            m: stock.marketCap || 0,
        }));

        setResults(mappedResults);
        setSelectedIndex(-1);
        setIsOpen(true);
    }, [query, allStocks]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || results.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < results.length) {
                const stock = results[selectedIndex];
                if (stock) onToggleFavorite(stock.t);
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const handleSelect = (ticker: string) => {
        onToggleFavorite(ticker);
        // Optional: keep open so user can select multiple, or close? The requested behavior lets them toggle.
        // It's usually better to keep focus so they can continue typing/adding.
    };

    return (
        <div ref={wrapperRef} className="relative w-full max-w-sm">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                    type="text"
                    placeholder="Search stocks to add..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (!isOpen && e.target.value.trim().length > 0) setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (query.trim().length > 0) setIsOpen(true);
                    }}
                    className="pmp-input pl-9 pr-10"
                />
            </div>

            {isOpen && query.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-2 pmp-dropdown-menu">
                    {results.length > 0 ? (
                        results.map((r, i) => {
                            const favorited = isFavorite(r.t);
                            const name = getCompanyName(r.t);
                            const isSelected = selectedIndex === i;

                            return (
                                <button
                                    key={r.t}
                                    onClick={() => handleSelect(r.t)}
                                    // Make sure mouse enter updates selectedIndex so keyboard/mouse mix perfectly:
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={`pmp-dropdown-option ${isSelected ? 'selected' : ''}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="flex-shrink-0">
                                            <CompanyLogo ticker={r.t} size={28} className="rounded-md" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.t}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                                                {name}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                ${r.p.toFixed(2)}
                                            </div>
                                            <div className={`text-xs font-semibold ${r.c >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                {r.c >= 0 ? '+' : ''}{r.c.toFixed(2)}%
                                            </div>
                                        </div>

                                        <div
                                            className={`p-1.5 rounded-md transition-colors ${favorited
                                                ? 'text-yellow-500 bg-yellow-500/10'
                                                : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'
                                                }`}
                                        >
                                            <Star size={18} fill={favorited ? "currentColor" : "none"} strokeWidth={favorited ? 1 : 2} />
                                        </div>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <div className="px-4 py-6 text-center">
                            <div className="text-sm text-slate-500 dark:text-slate-400">No stocks found for "{query}"</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
