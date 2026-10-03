'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ScreenerResult, ScreenerPagination, MARKET_CAP_PRESETS, RANGE_FILTERS,
    RangeFilterKey, ScreenerPreset,
    SCORE_FILTERS, ADVANCED_FILTERS, PRESET_SCORE_KEYS,
    ScoreFilterKey, AdvancedFilterKey, ScoreRange,
    SCORE_RANGE_MIN, SCORE_RANGE_MAX,
} from '@/lib/utils/screener';

interface UseScreenerOptions {
    initialLimit?: number;
    defaultMinHealth?: number;
    defaultMinProfit?: number;
    defaultMinValue?: number;
    initialData?: any[] | undefined;
}

type AdvancedState = Record<AdvancedFilterKey, number>;

const ADVANCED_DEFAULTS = Object.fromEntries(
    ADVANCED_FILTERS.map((d) => [d.key, d.def])
) as AdvancedState;

/**
 * Screener filter state — registry-driven (SCORE_FILTERS / ADVANCED_FILTERS /
 * RANGE_FILTERS in lib/utils/screener.ts). Score and metric filters share the
 * same sparse-map shape: an absent key means "no constraint" (full range),
 * which keeps add-a-filter a one-line registry change instead of touching a
 * dozen useState/serialize/restore sites.
 */
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
            sparkline: r.sparkline ?? null,
            metrics: r.metrics ?? null,
            healthScore: r.healthScore ?? null,
            profitabilityScore: r.profitabilityScore ?? null,
            valuationScore: r.valuationScore ?? null,
            growthScore: r.growthScore ?? null,
            qualityScore: r.qualityScore ?? null,
            overallScore: r.overallScore ?? null,
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
            insiderNetBuyPct90d: r.insiderNetBuyPct90d ?? null,
            insiderNetBuyValue90d: r.insiderNetBuyValue90d ?? null,
            insiderLargestBuyValue90d: r.insiderLargestBuyValue90d ?? null,
            insiderLargestSellValue90d: r.insiderLargestSellValue90d ?? null,
            insiderUniqueBuyers14d: r.insiderUniqueBuyers14d ?? null,
            insiderUniqueSellers14d: r.insiderUniqueSellers14d ?? null,
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

    // ── Filter state ────────────────────────────────────────────────────
    // scoreRanges: absent key = 0–100 (no constraint). Seeded with the
    // caller's default mins (GlobalScreener defaults to 50s, StockScreener 0s).
    const [scoreRanges, setScoreRanges] = useState<Partial<Record<ScoreFilterKey, ScoreRange>>>(() => {
        const seed: Partial<Record<ScoreFilterKey, ScoreRange>> = {};
        if (defaultMinHealth !== SCORE_RANGE_MIN) seed.health = { min: defaultMinHealth };
        if (defaultMinProfit !== SCORE_RANGE_MIN) seed.profitability = { min: defaultMinProfit };
        if (defaultMinValue !== SCORE_RANGE_MIN) seed.valuation = { min: defaultMinValue };
        return seed;
    });
    const setScoreRange = useCallback((key: ScoreFilterKey, range: ScoreRange | undefined) => {
        setScoreRanges(prev => {
            const next = { ...prev };
            if (range === undefined || (range.min === undefined && range.max === undefined)) delete next[key];
            else next[key] = range;
            return next;
        });
    }, []);

    const [advanced, setAdvanced] = useState<AdvancedState>({ ...ADVANCED_DEFAULTS });
    const setAdvancedValue = useCallback((key: AdvancedFilterKey, v: number) => {
        setAdvanced(prev => ({ ...prev, [key]: v }));
    }, []);

    const [selectedSector, setSelectedSector] = useState<string>('');
    const [selectedIndustry, setSelectedIndustry] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [industries, setIndustries] = useState<string[]>([]);
    const [marketCapPreset, setMarketCapPreset] = useState<string>('all');
    const [sortField, setSortField] = useState<string>('ticker.lastMarketCap');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    // Range filters — only entries the user touched are kept;
    // missing key = no filter for that metric.
    const [metricRanges, setMetricRanges] = useState<Partial<Record<RangeFilterKey, { min?: number; max?: number }>>>({});
    const setMetricRange = useCallback((key: RangeFilterKey, range: { min?: number; max?: number } | undefined) => {
        setMetricRanges(prev => {
            const next = { ...prev };
            if (range === undefined) delete next[key];
            else next[key] = range;
            return next;
        });
    }, []);

    // Debounced filter values — one snapshot object, registry-independent shape.
    const [debouncedFilters, setDebouncedFilters] = useState({
        scoreRanges, advanced,
        selectedSector: '',
        selectedIndustry: '',
        searchQuery: '',
        marketCapPreset: 'all',
        sortField: 'ticker.lastMarketCap', sortOrder: 'desc' as 'asc' | 'desc',
        metricRanges: {} as typeof metricRanges,
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedFilters({
                scoreRanges, advanced,
                selectedSector, selectedIndustry, searchQuery,
                marketCapPreset, sortField, sortOrder, metricRanges,
            });
        }, 400);
        return () => clearTimeout(timer);
    }, [scoreRanges, advanced, selectedSector, selectedIndustry, searchQuery, marketCapPreset, sortField, sortOrder, metricRanges]);

    // Stale-response guard — rapid typing/slider drags fire several fetches;
    // only the latest request may commit results, otherwise a slow earlier
    // response (e.g. the big unfiltered payload) lands last and visually
    // "cancels" a narrower search.
    const reqSeq = useRef(0);
    const fetchResults = useCallback(async () => {
        const seq = ++reqSeq.current;
        setLoading(true);
        try {
            const params = new URLSearchParams({
                sort: `${debouncedFilters.sortField}:${debouncedFilters.sortOrder}`,
                limit: initialLimit.toString(),
                page: page.toString()
            });
            // Score ranges — always sent (explicit bounds keep null-score
            // tickers out of the scored universe, the historical semantics).
            for (const def of SCORE_FILTERS) {
                const r = debouncedFilters.scoreRanges[def.key];
                params.append(def.apiMin, (r?.min ?? SCORE_RANGE_MIN).toString());
                params.append(def.apiMax, (r?.max ?? SCORE_RANGE_MAX).toString());
            }
            // Advanced filters — only sent when active (sentinel defaults).
            for (const def of ADVANCED_FILTERS) {
                const v = debouncedFilters.advanced[def.key];
                if (def.active(v)) params.append(def.param, v.toString());
            }
            if (debouncedFilters.selectedSector) params.append('sector', debouncedFilters.selectedSector);
            if (debouncedFilters.selectedIndustry) params.append('industry', debouncedFilters.selectedIndustry);
            if (debouncedFilters.searchQuery) params.append('q', debouncedFilters.searchQuery);

            // Market Cap preset → min/max billions
            const mcPreset = MARKET_CAP_PRESETS.find(p => p.id === debouncedFilters.marketCapPreset);
            if (mcPreset) {
                if (mcPreset.min !== undefined) params.append('minMarketCap', mcPreset.min.toString());
                if (mcPreset.max !== undefined) params.append('maxMarketCap', mcPreset.max.toString());
            }

            // Metric range filters (minRoe/maxRoe/… — camelCase field names)
            for (const [key, range] of Object.entries(debouncedFilters.metricRanges)) {
                if (!range) continue;
                const cap = key[0]!.toUpperCase() + key.slice(1);
                if (range.min !== undefined) params.append(`min${cap}`, range.min.toString());
                if (range.max !== undefined) params.append(`max${cap}`, range.max.toString());
            }

            const res = await fetch(`/api/analysis/screener?${params.toString()}`);
            const data = await res.json();
            if (seq !== reqSeq.current) return;
            setResults(data.results || []);
            setPagination(data.pagination || null);
            if (Array.isArray(data.industries) && data.industries.length > 0) {
                setIndustries(data.industries);
            }
        } catch (error) {
            if (seq !== reqSeq.current) return;
            console.error('Failed to fetch screener results:', error);
            setResults([]);
        } finally {
            if (seq === reqSeq.current) setLoading(false);
        }
    }, [debouncedFilters, page, initialLimit]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Reset page on filter change (immediate, not debounced)
    useEffect(() => {
        setPage(1);
    }, [scoreRanges, advanced, selectedSector, selectedIndustry, searchQuery, marketCapPreset, sortField, sortOrder, metricRanges]);

    /**
     * Restore all filter state from a query param set — used for the initial
     * URL on /screener and for applying a saved screen (which is stored as
     * exactly this query-string form).
     */
    const restoreFromParams = useCallback((sp: URLSearchParams) => {
        // Unconditional defaults — a query/saved-screen is a COMPLETE state:
        // absent keys reset to defaults, otherwise stale filters would leak
        // across saved-screen switches.
        const num = (k: string, fb: number) => {
            const v = parseFloat(sp.get(k) ?? '');
            return Number.isFinite(v) ? v : fb;
        };
        const scores: typeof scoreRanges = {};
        for (const def of SCORE_FILTERS) {
            const r: ScoreRange = {};
            const lo = sp.get(def.urlMin), hi = sp.get(def.urlMax);
            if (lo !== null && Number.isFinite(parseFloat(lo))) r.min = parseFloat(lo);
            if (hi !== null && Number.isFinite(parseFloat(hi))) r.max = parseFloat(hi);
            if (r.min !== undefined || r.max !== undefined) scores[def.key] = r;
        }
        setScoreRanges(scores);
        const adv = { ...ADVANCED_DEFAULTS };
        for (const def of ADVANCED_FILTERS) adv[def.key] = num(def.param, def.def);
        setAdvanced(adv);
        setSelectedSector(sp.get('sector') ?? '');
        setSelectedIndustry(sp.get('industry') ?? '');
        setSearchQuery(sp.get('q') ?? '');
        const m = sp.get('mcap') ?? 'all';
        setMarketCapPreset(MARKET_CAP_PRESETS.some((p) => p.id === m) ? m : 'all');
        const sort = sp.get('sort');
        if (sort) {
            const [f, o] = sort.split(':');
            if (f) setSortField(f); else setSortField('ticker.lastMarketCap');
            setSortOrder(o === 'asc' || o === 'desc' ? o : 'desc');
        } else {
            setSortField('ticker.lastMarketCap');
            setSortOrder('desc');
        }
        // Range filters: minRoe/maxRoe/... (camelCase key names, registry-driven)
        const restored: typeof metricRanges = {};
        for (const def of RANGE_FILTERS) {
            const cap = def.key[0]!.toUpperCase() + def.key.slice(1);
            const lo = sp.get(`min${cap}`);
            const hi = sp.get(`max${cap}`);
            const range: { min?: number; max?: number } = {};
            if (lo !== null) {
                const v = parseFloat(lo);
                if (Number.isFinite(v)) range.min = v;
            }
            if (hi !== null) {
                const v = parseFloat(hi);
                if (Number.isFinite(v)) range.max = v;
            }
            if (range.min !== undefined || range.max !== undefined) restored[def.key] = range;
        }
        setMetricRanges(restored);
    }, []);

    // Restore once from the landing URL — /screener page only.
    useEffect(() => {
        if (window.location.pathname !== '/screener') return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.size === 0) return;
        restoreFromParams(sp);
    }, [restoreFromParams]);

    /** Serialize current filter state to the query-string form. */
    const buildParamsString = useCallback((): string => {
        const sp = new URLSearchParams();
        for (const def of SCORE_FILTERS) {
            const r = scoreRanges[def.key];
            if (r?.min !== undefined && r.min !== SCORE_RANGE_MIN) sp.set(def.urlMin, r.min.toString());
            if (r?.max !== undefined && r.max !== SCORE_RANGE_MAX) sp.set(def.urlMax, r.max.toString());
        }
        for (const def of ADVANCED_FILTERS) {
            const v = advanced[def.key];
            if (def.active(v)) sp.set(def.param, v.toString());
        }
        if (selectedSector) sp.set('sector', selectedSector);
        if (selectedIndustry) sp.set('industry', selectedIndustry);
        if (searchQuery) sp.set('q', searchQuery);
        if (marketCapPreset !== 'all') sp.set('mcap', marketCapPreset);
        for (const [key, range] of Object.entries(metricRanges)) {
            if (!range) continue;
            const cap = key[0]!.toUpperCase() + key.slice(1);
            if (range.min !== undefined) sp.set(`min${cap}`, range.min.toString());
            if (range.max !== undefined) sp.set(`max${cap}`, range.max.toString());
        }
        if (sortField !== 'ticker.lastMarketCap' || sortOrder !== 'desc') sp.set('sort', `${sortField}:${sortOrder}`);
        return sp.toString();
    }, [scoreRanges, advanced, selectedSector, selectedIndustry, searchQuery, marketCapPreset, sortField, sortOrder, metricRanges]);

    /**
     * Is the current filter state exactly what this preset would produce?
     * (preset applied = resetFilters + preset fields; any user deviation
     * or extra range deactivates the highlight).
     */
    const isPresetActive = useCallback((p: ScreenerPreset): boolean => {
        for (const [presetField, key] of Object.entries(PRESET_SCORE_KEYS)) {
            const r = scoreRanges[key];
            const expectedMin = (p[presetField as keyof ScreenerPreset] as number | undefined) ?? SCORE_RANGE_MIN;
            if ((r?.min ?? SCORE_RANGE_MIN) !== expectedMin) return false;
            if ((r?.max ?? SCORE_RANGE_MAX) !== SCORE_RANGE_MAX) return false;
        }
        const expectedAdv: AdvancedState = { ...ADVANCED_DEFAULTS };
        if (p.minAltman !== undefined) expectedAdv.minAltman = p.minAltman;
        if (p.minFcfMargin !== undefined) expectedAdv.minFcfMargin = p.minFcfMargin;
        for (const def of ADVANCED_FILTERS) {
            if (advanced[def.key] !== expectedAdv[def.key]) return false;
        }
        if (selectedSector !== '' || selectedIndustry !== '' || searchQuery !== '') return false;
        if (marketCapPreset !== (p.marketCapPreset ?? 'all')) return false;
        // Sort is user-controlled presentation, not part of preset identity —
        // a preset pill stays active while the user re-sorts the same screen.
        const expected = p.ranges ?? {};
        const keys = new Set([...Object.keys(metricRanges), ...Object.keys(expected)]);
        for (const k of keys) {
            const a = metricRanges[k as RangeFilterKey];
            const b = expected[k as RangeFilterKey];
            if (a?.min !== b?.min || a?.max !== b?.max) return false;
        }
        return true;
    }, [scoreRanges, advanced, selectedSector, selectedIndustry, searchQuery, marketCapPreset, metricRanges]);

    // Sync filters → URL (replaceState: shareable, no history pollution).
    // Standalone /screener page only — the homepage embed lives under
    // /?tab=screener and its URL belongs to tab navigation.
    useEffect(() => {
        if (window.location.pathname !== '/screener') return;
        const sp = new URLSearchParams(buildParamsString());
        // Preserve the ?view= param — it is owned by the column-view state in
        // StockScreener, not by this hook's filter state.
        const view = new URLSearchParams(window.location.search).get('view');
        if (view) sp.set('view', view);
        const qs = sp.toString();
        window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, [buildParamsString]);

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
        setScoreRanges({});
        setAdvanced({ ...ADVANCED_DEFAULTS });
        setSelectedSector('');
        setSelectedIndustry('');
        setSearchQuery('');
        setMarketCapPreset('all');
        setMetricRanges({});
        setSortField('ticker.lastMarketCap');
        setSortOrder('desc');
    };

    const hasActiveFilters =
        Object.keys(scoreRanges).length > 0 ||
        ADVANCED_FILTERS.some((d) => d.active(advanced[d.key])) ||
        selectedSector !== '' || selectedIndustry !== '' || searchQuery !== '' ||
        marketCapPreset !== 'all' ||
        Object.keys(metricRanges).length > 0;

    /** Apply a named quick-screen preset (sets multiple filters atomically). */
    const applyPreset = (preset: ScreenerPreset) => {
        resetFilters();
        for (const [presetField, key] of Object.entries(PRESET_SCORE_KEYS)) {
            const v = preset[presetField as keyof ScreenerPreset] as number | undefined;
            if (v !== undefined) setScoreRange(key, { min: v });
        }
        if (preset.minAltman !== undefined) setAdvancedValue('minAltman', preset.minAltman);
        if (preset.minFcfMargin !== undefined) setAdvancedValue('minFcfMargin', preset.minFcfMargin);
        if (preset.marketCapPreset !== undefined) setMarketCapPreset(preset.marketCapPreset);
        if (preset.ranges) {
            for (const [key, range] of Object.entries(preset.ranges)) {
                if (range) setMetricRange(key as RangeFilterKey, range);
            }
        }
        if (preset.sort) {
            const [f, o] = preset.sort.split(':');
            if (f) setSortField(f);
            if (o === 'asc' || o === 'desc') setSortOrder(o);
        }
    };

    return {
        results, pagination, loading, page, setPage,
        // registry-driven filter state
        scoreRanges, setScoreRange,
        advanced, setAdvancedValue,
        selectedSector, setSelectedSector,
        selectedIndustry, setSelectedIndustry,
        searchQuery, setSearchQuery,
        industries,
        marketCapPreset, setMarketCapPreset,
        metricRanges, setMetricRange,
        // sort
        sortField, sortOrder, handleSort, setSort,
        // utils
        resetFilters, hasActiveFilters, applyPreset,
        // saved screens / share links
        buildParamsString, restoreFromParams, isPresetActive,
    };
}
