'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Star } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { StockData } from '@/lib/types';
import { useTickerAutocomplete } from '@/hooks/useTickerAutocomplete';

interface AddFavoriteSearchProps {
    onToggleFavorite: (ticker: string) => void;
    isFavorite: (ticker: string) => boolean;
    allStocks: StockData[];
}

export function AddFavoriteSearch({ onToggleFavorite, isFavorite, allStocks }: AddFavoriteSearchProps) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const { results, isSearching } = useTickerAutocomplete(query, allStocks, { limit: 6 });
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

    useEffect(() => {
        setSelectedIndex(-1);
        if (query.trim().length > 0) {
            setIsOpen(true);
        }
    }, [query]);

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
                if (stock) onToggleFavorite(stock.ticker);
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
        <div ref={wrapperRef} className="relative w-full sm:max-w-sm">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
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
                    className="pmp-input !pl-9 !pr-9"
                />
            </div>

            {isOpen && query.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-2 pmp-dropdown-menu">
                    {results.length > 0 ? (
                        results.map((r, i) => {
                            const favorited = isFavorite(r.ticker);
                            const name = r.companyName;
                            const isSelected = selectedIndex === i;

                            return (
                                <button
                                    key={r.ticker}
                                    onClick={() => handleSelect(r.ticker)}
                                    // Make sure mouse enter updates selectedIndex so keyboard/mouse mix perfectly:
                                    onMouseEnter={() => setSelectedIndex(i)}
                                    className={`pmp-dropdown-option ${isSelected ? 'selected' : ''}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="flex-shrink-0">
                                            <CompanyLogo ticker={r.ticker} size={28} className="rounded-md" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{r.ticker}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                                                {name}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 flex-shrink-0">
                                        <div className="text-right">
                                            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                                                ${r.currentPrice.toFixed(2)}
                                            </div>
                                            <div className={`text-xs font-semibold ${r.percentChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                {r.percentChange >= 0 ? '+' : ''}{r.percentChange.toFixed(2)}%
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
                            <div className="text-sm text-slate-500 dark:text-slate-400">
                                {isSearching ? `Searching for "${query}"...` : `No stocks found for "${query}"`}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
