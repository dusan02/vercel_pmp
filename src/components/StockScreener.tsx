'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import CompanyLogo from './CompanyLogo';

interface ScreenerResult {
  symbol: string;
  healthScore: number | null;
  profitabilityScore: number | null;
  valuationScore: number | null;
  altmanZ: number | null;
  ticker: {
    name: string;
    sector: string;
    industry: string;
    logoUrl: string | null;
    lastPrice: number | null;
    lastMarketCap: number | null;
  };
}

interface ScreenerResponse {
  results: ScreenerResult[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const SECTORS = [
  'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
  'Industrials', 'Communication Services', 'Consumer Defensive',
  'Energy', 'Utilities', 'Real Estate', 'Basic Materials',
];

const SORT_OPTIONS = [
  { value: 'healthScore:desc', label: 'Health Score ↓' },
  { value: 'healthScore:asc', label: 'Health Score ↑' },
  { value: 'profitabilityScore:desc', label: 'Profitability ↓' },
  { value: 'valuationScore:desc', label: 'Valuation ↓' },
  { value: 'altmanZ:desc', label: 'Altman Z ↓' },
  { value: 'ticker:lastMarketCap:desc', label: 'Market Cap ↓' },
];

function formatMarketCap(mc: number | null): string {
  if (!mc || mc <= 0) return '-';
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(1)}M`;
  return `$${mc.toFixed(0)}`;
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-400';
  if (score >= 75) return 'text-green-600 dark:text-green-400 font-semibold';
  if (score >= 50) return 'text-yellow-600 dark:text-yellow-400 font-medium';
  return 'text-red-600 dark:text-red-400 font-medium';
}

export default function StockScreener() {
  const router = useRouter();
  const [results, setResults] = useState<ScreenerResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [minHealth, setMinHealth] = useState('');
  const [minProfitability, setMinProfitability] = useState('');
  const [minValuation, setMinValuation] = useState('');
  const [minAltman, setMinAltman] = useState('');
  const [sector, setSector] = useState('');
  const [sort, setSort] = useState('healthScore:desc');

  // Debounced filter application
  const [appliedFilters, setAppliedFilters] = useState({
    minHealth: '',
    minProfitability: '',
    minValuation: '',
    minAltman: '',
    sector: '',
    sort: 'healthScore:desc',
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedFilters({
        minHealth, minProfitability, minValuation, minAltman, sector, sort,
      });
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [minHealth, minProfitability, minValuation, minAltman, sector, sort]);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '25');
      params.set('sort', appliedFilters.sort);
      if (appliedFilters.minHealth) params.set('minHealth', appliedFilters.minHealth);
      if (appliedFilters.minProfitability) params.set('minProfitability', appliedFilters.minProfitability);
      if (appliedFilters.minValuation) params.set('minValuation', appliedFilters.minValuation);
      if (appliedFilters.minAltman) params.set('minAltman', appliedFilters.minAltman);
      if (appliedFilters.sector) params.set('sector', appliedFilters.sector);

      const res = await fetch(`/api/analysis/screener?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: ScreenerResponse = await res.json();
      // Map API response: 'symbol' is ticker string, 'ticker' is relation object
      const mapped = (data.results || []).map((r: any) => ({
        ...r,
        ticker: r.ticker,
        symbol: r.symbol,
      }));
      setResults(mapped);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total || 0);
    } catch (err) {
      console.error('Screener fetch error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [page, appliedFilters]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleTickerClick = (ticker: string) => {
    router.push(`/analysis/${ticker}`);
  };

  const resetFilters = () => {
    setMinHealth('');
    setMinProfitability('');
    setMinValuation('');
    setMinAltman('');
    setSector('');
    setSort('healthScore:desc');
  };

  const hasActiveFilters = minHealth || minProfitability || minValuation || minAltman || sector;

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Filters</h2>
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Min Health Score */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min Health</label>
            <input
              type="number"
              min="0"
              max="100"
              value={minHealth}
              onChange={(e) => setMinHealth(e.target.value)}
              placeholder="0-100"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Min Profitability */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min Profitability</label>
            <input
              type="number"
              min="0"
              max="100"
              value={minProfitability}
              onChange={(e) => setMinProfitability(e.target.value)}
              placeholder="0-100"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Min Valuation */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min Valuation</label>
            <input
              type="number"
              min="0"
              max="100"
              value={minValuation}
              onChange={(e) => setMinValuation(e.target.value)}
              placeholder="0-100"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Min Altman Z */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Min Altman Z</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={minAltman}
              onChange={(e) => setMinAltman(e.target.value)}
              placeholder="e.g. 3.0"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Sector */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sector</label>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="">All Sectors</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Sort By</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500 outline-none"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Company</th>
                <th className="text-left py-3 px-4 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Sector</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Price</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300 hidden sm:table-cell">Market Cap</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300">Health</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Profit.</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300 hidden md:table-cell">Valuation</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600 dark:text-gray-300 hidden lg:table-cell">Altman Z</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-gray-100 dark:border-slate-700">
                  <td className="py-3 px-4"><div className="h-4 w-32 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" /></td>
                  <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-20 bg-gray-200 dark:bg-slate-700 rounded animate-pulse" /></td>
                  <td className="py-3 px-4"><div className="h-4 w-16 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                  <td className="py-3 px-4 hidden sm:table-cell"><div className="h-4 w-16 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                  <td className="py-3 px-4"><div className="h-4 w-10 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                  <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-10 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                  <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-10 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                  <td className="py-3 px-4 hidden lg:table-cell"><div className="h-4 w-10 bg-gray-200 dark:bg-slate-700 rounded animate-pulse ml-auto" /></td>
                </tr>
              ))}

              {!loading && results.map((r) => (
                <tr
                  key={r.symbol}
                  onClick={() => handleTickerClick(r.symbol)}
                  className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 flex items-center justify-center shrink-0">
                        <CompanyLogo ticker={r.symbol} size={32} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white">{r.symbol}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">
                          {r.ticker?.name || r.symbol}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300 hidden md:table-cell text-xs">
                    {r.ticker?.sector || '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-200">
                    {r.ticker?.lastPrice ? `$${r.ticker.lastPrice.toFixed(2)}` : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-200 hidden sm:table-cell">
                    {formatMarketCap(r.ticker?.lastMarketCap ?? null)}
                  </td>
                  <td className={`py-3 px-4 text-right ${scoreColor(r.healthScore)}`}>
                    {r.healthScore !== null ? r.healthScore.toFixed(0) : '-'}
                  </td>
                  <td className={`py-3 px-4 text-right hidden md:table-cell ${scoreColor(r.profitabilityScore)}`}>
                    {r.profitabilityScore !== null ? r.profitabilityScore.toFixed(0) : '-'}
                  </td>
                  <td className={`py-3 px-4 text-right hidden md:table-cell ${scoreColor(r.valuationScore)}`}>
                    {r.valuationScore !== null ? r.valuationScore.toFixed(0) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-200 hidden lg:table-cell">
                    {r.altmanZ !== null ? r.altmanZ.toFixed(2) : '-'}
                  </td>
                </tr>
              ))}

              {!loading && results.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 dark:text-gray-500">
                    No companies match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
