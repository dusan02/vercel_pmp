'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Star, Loader2 } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';

interface MinimalRow {
    t: string;  // ticker
    p: number;  // price
    c: number;  // changePct
    m: number;  // marketCap
}

interface ApiResp {
    rows: MinimalRow[];
    error?: string;
}

interface AddFavoriteSearchProps {
    onToggleFavorite: (ticker: string) => void;
    isFavorite: (ticker: string) => boolean;
}

export function AddFavoriteSearch({ onToggleFavorite, isFavorite }: AddFavoriteSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<MinimalRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
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

    // Debounced search
    useEffect(() => {
        const searchTimer = setTimeout(async () => {
            const q = query.trim().toUpperCase();
            if (q.length === 0) {
                setResults([]);
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                const res = await fetch(`/api/stocks/optimized?q=${q}&limit=6`);
                if (res.ok) {
                    const data: ApiResp = await res.json();
                    setResults(data.rows || []);
                    setSelectedIndex(-1);
                    setIsOpen(true);
                }
            } catch (e) {
                console.error('Failed to search stocks:', e);
            } finally {
                setIsLoading(false);
            }
        }, 300);

        return () => clearTimeout(searchTimer);
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
                    className="w-full pl-9 pr-10 py-2 bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none transition-all placeholder:text-slate-400 focus:bg-white dark:focus:bg-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                {isLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="animate-spin text-slate-400" size={16} />
                    </div>
                )}
            </div>

            {isOpen && query.trim().length > 0 && (
                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden py-1">
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
                                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left transition-colors ${isSelected
                                        ? 'bg-blue-50 dark:bg-blue-900/20'
                                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                        }`}
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
                    ) : !isLoading ? (
                        <div className="px-4 py-6 text-center">
                            <div className="text-sm text-slate-500 dark:text-slate-400">No stocks found for "{query}"</div>
                        </div>
                    ) : (
                        <div className="px-4 py-6 text-center">
                            <div className="text-sm text-slate-500 dark:text-slate-400">Searching...</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
