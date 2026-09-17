'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScreenerResult, ScreenerPagination, MARKET_CAP_PRESETS } from '@/lib/utils/screener';

interface UseScreenerOptions {
    initialLimit?: number;
    defaultMinHealth?: number;
    defaultMinProfit?: number;
    defaultMinValue?: number;
    initialData?: any[] | undefined;
}

export function useScreener({
    initialLimit = 20,
    defaultMinHealth = 50,
    defaultMinProfit = 50,
    defaultMinValue = 50,
    initialData,
}: UseScreenerOptions = {}) {
    const [results, setResults] = useState<ScreenerResult[]>(() => {
        if (!initialData || !Array.isArray(initialData)) return [];
        // Transform SSR data to ScreenerResult format (matches API response)
        return initialData.map((r: any): ScreenerResult => ({
            symbol: r.ticker?.symbol ?? r.symbol ?? '',
            healthScore: r.healthScore ?? null,
            profitabilityScore: r.profitabilityScore ?? null,
            valuationScore: r.valuationScore ?? null,
            altmanZ: r.altmanZ ?? null,
            piotroskiScore: r.piotroskiScore ?? null,
            beneishScore: null,
            fcfMargin: null,
            fcfConversion: null,
            debtRepaymentYears: null,
            interestCoverage: null,
            revenueCagr: null,
            netIncomeCagr: null,
            marginStability: null,
            lastQualitySignalAt: null,
            ticker: r.ticker ? {
                name: r.ticker.name ?? null,
                sector: r.ticker.sector ?? null,
                industry: r.ticker.industry ?? null,
                logoUrl: r.ticker.logoUrl ?? null,
                lastPrice: r.ticker.lastPrice ?? null,
                lastChangePct: r.ticker.lastChangePct ?? null,
                lastMarketCap: r.ticker.lastMarketCap ?? null,
                marketCapDiff: r.ticker.marketCapDiff ?? null,
            } : null,
        }));
    });
    const [pagination, setPagination] = useState<ScreenerPagination | null>(() => {
        if (!initialData || !Array.isArray(initialData)) return null;
        return { total: initialData.length, page: 1, limit: initialLimit, totalPages: 1 };
    });
    const [loading, setLoading] = useState(() => !initialData || initialData.length === 0);
    const [page, setPage] = useState(1);

    // Filters
    const [minHealth, setMinHealth] = useState<number>(defaultMinHealth);
    const [maxHealth, setMaxHealth] = useState<number>(100);
    const [minProfit, setMinProfit] = useState<number>(defaultMinProfit);
    const [maxProfit, setMaxProfit] = useState<number>(100);
    const [minValue, setMinValue] = useState<number>(defaultMinValue);
    const [maxValue, setMaxValue] = useState<number>(100);
    const [minAltman, setMinAltman] = useState<number>(0);
    const [minPiotroski, setMinPiotroski] = useState<number>(0);
    const [maxBeneish, setMaxBeneish] = useState<number>(10); // 10 = effectively no filter (most scores are < 10)
    const [minFcfMargin, setMinFcfMargin] = useState<number>(-100); // -100% = effectively no filter
    const [maxDebtRepayment, setMaxDebtRepayment] = useState<number>(350); // 350 = effectively no filter
    const [selectedSector, setSelectedSector] = useState<string>('');
    const [selectedIndustry, setSelectedIndustry] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [industries, setIndustries] = useState<string[]>([]);
    const [marketCapPreset, setMarketCapPreset] = useState<string>('all');
    const [sortField, setSortField] = useState<string>('ticker.lastMarketCap');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Debounced filter values
    const [debouncedFilters, setDebouncedFilters] = useState({
        minHealth: defaultMinHealth, maxHealth: 100,
        minProfit: defaultMinProfit, maxProfit: 100,
        minValue: defaultMinValue, maxValue: 100,
        minAltman: 0,
        minPiotroski: 0, maxBeneish: 10,
        minFcfMargin: -100, maxDebtRepayment: 350,
        selectedSector: '',
        selectedIndustry: '',
        searchQuery: '',
        marketCapPreset: 'all',
        sortField: 'ticker.lastMarketCap', sortOrder: 'desc' as 'asc' | 'desc',
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilters({
                minHealth, maxHealth,
                minProfit, maxProfit,
                minValue, maxValue,
                minAltman,
                minPiotroski, maxBeneish,
                minFcfMargin, maxDebtRepayment,
                selectedSector,
                selectedIndustry,
                searchQuery,
                marketCapPreset,
                sortField, sortOrder,
            });
        }, 400);
        return () => clearTimeout(timer);
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, minPiotroski, maxBeneish, minFcfMargin, maxDebtRepayment, selectedSector, selectedIndustry, searchQuery, marketCapPreset, sortField, sortOrder]);

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                minHealth: debouncedFilters.minHealth.toString(),
                maxHealth: debouncedFilters.maxHealth.toString(),
                minProfitability: debouncedFilters.minProfit.toString(),
                maxProfitability: debouncedFilters.maxProfit.toString(),
                minValuation: debouncedFilters.minValue.toString(),
                maxValuation: debouncedFilters.maxValue.toString(),
                minAltman: debouncedFilters.minAltman.toString(),
                sort: `${debouncedFilters.sortField}:${debouncedFilters.sortOrder}`,
                limit: initialLimit.toString(),
                page: page.toString()
            });
            if (debouncedFilters.selectedSector) params.append('sector', debouncedFilters.selectedSector);
            if (debouncedFilters.selectedIndustry) params.append('industry', debouncedFilters.selectedIndustry);
            if (debouncedFilters.searchQuery) params.append('q', debouncedFilters.searchQuery);

            // Advanced filters — only send if user has changed from defaults
            if (debouncedFilters.minPiotroski > 0) params.append('minPiotroski', debouncedFilters.minPiotroski.toString());
            if (debouncedFilters.maxBeneish < 10) params.append('maxBeneish', debouncedFilters.maxBeneish.toString());
            if (debouncedFilters.minFcfMargin > -100) params.append('minFcfMargin', debouncedFilters.minFcfMargin.toString());
            if (debouncedFilters.maxDebtRepayment < 350) params.append('maxDebtRepayment', debouncedFilters.maxDebtRepayment.toString());

            // Market Cap filter
            const mcPreset = MARKET_CAP_PRESETS.find(p => p.id === debouncedFilters.marketCapPreset);
            if (mcPreset) {
                if (mcPreset.min !== undefined) params.append('minMarketCap', mcPreset.min.toString());
                if (mcPreset.max !== undefined) params.append('maxMarketCap', mcPreset.max.toString());
            }

            const res = await fetch(`/api/analysis/screener?${params.toString()}`);
            const data = await res.json();
            setResults(data.results || []);
            setPagination(data.pagination || null);
            if (Array.isArray(data.industries) && data.industries.length > 0) {
                setIndustries(data.industries);
            }
        } catch (error) {
            console.error('Failed to fetch screener results:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [debouncedFilters, page, initialLimit]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Reset page on filter change (immediate, not debounced)
    useEffect(() => {
        setPage(1);
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, minPiotroski, maxBeneish, minFcfMargin, maxDebtRepayment, selectedSector, marketCapPreset, sortField, sortOrder]);

    // Restore filters from URL on mount (shareable screener state).
    // ONLY on the standalone /screener page — the homepage embed lives under
    // /?tab=screener and its URL belongs to the tab navigation; rewriting it
    // here strips ?tab=... and snaps the homepage back to the heatmap tab.
    useEffect(() => {
        if (window.location.pathname !== '/screener') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.size === 0) return;
        const num = (k: string, fb: number) => {
            const v = parseFloat(sp.get(k) ?? '');
            return Number.isFinite(v) ? v : fb;
        };
        setMinHealth(num('minHealth', 0));
        if (sp.has('maxHealth')) setMaxHealth(num('maxHealth', 100));
        if (sp.has('minProfit')) setMinProfit(num('minProfit', 0));
        if (sp.has('maxProfit')) setMaxProfit(num('maxProfit', 100));
        if (sp.has('minValue')) setMinValue(num('minValue', 0));
        if (sp.has('maxValue')) setMaxValue(num('maxValue', 100));
        if (sp.has('minAltman')) setMinAltman(num('minAltman', 0));
        if (sp.has('minPiotroski')) setMinPiotroski(num('minPiotroski', 0));
        if (sp.has('maxBeneish')) setMaxBeneish(num('maxBeneish', 10));
        if (sp.has('minFcfMargin')) setMinFcfMargin(num('minFcfMargin', -100));
        if (sp.has('maxDebtRepayment')) setMaxDebtRepayment(num('maxDebtRepayment', 350));
        if (sp.has('sector')) setSelectedSector(sp.get('sector') ?? '');
        if (sp.has('industry')) setSelectedIndustry(sp.get('industry') ?? '');
        if (sp.has('q')) setSearchQuery(sp.get('q') ?? '');
        const sort = sp.get('sort');
        if (sort) {
            const [f, o] = sort.split(':');
            if (f) setSortField(f);
            if (o === 'asc' || o === 'desc') setSortOrder(o);
        }
    }, []);

    // Sync filters → URL (replaceState: shareable, no history pollution).
    // Standalone /screener page only — see the restore effect above.
    useEffect(() => {
        if (window.location.pathname !== '/screener') return;
        const sp = new URLSearchParams();
        if (minHealth !== 0) sp.set('minHealth', minHealth.toString());
        if (maxHealth !== 100) sp.set('maxHealth', maxHealth.toString());
        if (minProfit !== 0) sp.set('minProfit', minProfit.toString());
        if (maxProfit !== 100) sp.set('maxProfit', maxProfit.toString());
        if (minValue !== 0) sp.set('minValue', minValue.toString());
        if (maxValue !== 100) sp.set('maxValue', maxValue.toString());
        if (minAltman !== 0) sp.set('minAltman', minAltman.toString());
        if (minPiotroski > 0) sp.set('minPiotroski', minPiotroski.toString());
        if (maxBeneish < 10) sp.set('maxBeneish', maxBeneish.toString());
        if (minFcfMargin > -100) sp.set('minFcfMargin', minFcfMargin.toString());
        if (maxDebtRepayment < 350) sp.set('maxDebtRepayment', maxDebtRepayment.toString());
        if (selectedSector) sp.set('sector', selectedSector);
        if (selectedIndustry) sp.set('industry', selectedIndustry);
        if (searchQuery) sp.set('q', searchQuery);
        if (marketCapPreset !== 'all') sp.set('mcap', marketCapPreset);
        if (sortField !== 'healthScore' || sortOrder !== 'desc') sp.set('sort', `${sortField}:${sortOrder}`);
        const qs = sp.toString();
        window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, minPiotroski, maxBeneish, minFcfMargin, maxDebtRepayment, selectedSector, marketCapPreset, sortField, sortOrder]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc');
        }
    };

    const setSort = (field: string, order: 'asc' | 'desc') => {
        setSortField(field);
        setSortOrder(order);
    };

    const resetFilters = () => {
        setMinHealth(0); setMaxHealth(100);
        setMinProfit(0); setMaxProfit(100);
        setMinValue(0); setMaxValue(100);
        setMinAltman(0);
        setMinPiotroski(0);
        setMaxBeneish(10);
        setMinFcfMargin(-100);
        setMaxDebtRepayment(350);
        setSelectedSector('');
        setSelectedIndustry('');
        setSearchQuery('');
        setMarketCapPreset('all');
        setSortField('ticker.lastMarketCap');
        setSortOrder('desc');
    };

    const hasActiveFilters =
        minHealth !== 0 || maxHealth !== 100 ||
        minProfit !== 0 || maxProfit !== 100 ||
        minValue !== 0 || maxValue !== 100 ||
        minAltman !== 0 || selectedSector !== '' || marketCapPreset !== 'all' ||
        minPiotroski > 0 || maxBeneish < 10 || minFcfMargin > -100 || maxDebtRepayment < 350;

    return {
        results, pagination, loading, page, setPage,
        // filters
        minHealth, maxHealth, setMinHealth, setMaxHealth,
        minProfit, maxProfit, setMinProfit, setMaxProfit,
        minValue, maxValue, setMinValue, setMaxValue,
        minAltman, setMinAltman,
        minPiotroski, setMinPiotroski,
        maxBeneish, setMaxBeneish,
        minFcfMargin, setMinFcfMargin,
        maxDebtRepayment, setMaxDebtRepayment,
        selectedSector, setSelectedSector,
        selectedIndustry, setSelectedIndustry,
        searchQuery, setSearchQuery,
        industries,
        marketCapPreset, setMarketCapPreset,
        // sort
        sortField, sortOrder, handleSort, setSort,
        // utils
        resetFilters, hasActiveFilters,
    };
}
