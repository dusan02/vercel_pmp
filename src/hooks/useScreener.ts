'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScreenerResult, ScreenerPagination } from '@/lib/utils/screener';

interface UseScreenerOptions {
    initialLimit?: number;
    defaultSort?: string;
}

export function useScreener({ initialLimit = 20, defaultSort = 'healthScore:desc' }: UseScreenerOptions = {}) {
    const [results, setResults] = useState<ScreenerResult[]>([]);
    const [pagination, setPagination] = useState<ScreenerPagination | null>(null);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);

    // Filters
    const [minHealth, setMinHealth] = useState<number>(50);
    const [maxHealth, setMaxHealth] = useState<number>(100);
    const [minProfit, setMinProfit] = useState<number>(50);
    const [maxProfit, setMaxProfit] = useState<number>(100);
    const [minValue, setMinValue] = useState<number>(50);
    const [maxValue, setMaxValue] = useState<number>(100);
    const [minAltman, setMinAltman] = useState<number>(0);
    const [selectedSector, setSelectedSector] = useState<string>('');
    const [sortField, setSortField] = useState<string>('healthScore');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const fetchResults = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                minHealth: minHealth.toString(),
                maxHealth: maxHealth.toString(),
                minProfitability: minProfit.toString(),
                maxProfitability: maxProfit.toString(),
                minValuation: minValue.toString(),
                maxValuation: maxValue.toString(),
                minAltman: minAltman.toString(),
                sort: `${sortField}:${sortOrder}`,
                limit: initialLimit.toString(),
                page: page.toString()
            });
            if (selectedSector) params.append('sector', selectedSector);

            const res = await fetch(`/api/analysis/screener?${params.toString()}`);
            const data = await res.json();
            setResults(data.results || []);
            setPagination(data.pagination || null);
        } catch (error) {
            console.error('Failed to fetch screener results:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, selectedSector, sortField, sortOrder, page, initialLimit]);

    useEffect(() => {
        fetchResults();
    }, [fetchResults]);

    // Reset page on filter change
    useEffect(() => {
        setPage(1);
    }, [minHealth, maxHealth, minProfit, maxProfit, minValue, maxValue, minAltman, selectedSector, sortField, sortOrder]);

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
        setSelectedSector('');
        setSortField('healthScore');
        setSortOrder('desc');
    };

    const hasActiveFilters =
        minHealth !== 0 || maxHealth !== 100 ||
        minProfit !== 0 || maxProfit !== 100 ||
        minValue !== 0 || maxValue !== 100 ||
        minAltman !== 0 || selectedSector !== '';

    return {
        results, pagination, loading, page, setPage,
        // filters
        minHealth, maxHealth, setMinHealth, setMaxHealth,
        minProfit, maxProfit, setMinProfit, setMaxProfit,
        minValue, maxValue, setMinValue, setMaxValue,
        minAltman, setMinAltman,
        selectedSector, setSelectedSector,
        // sort
        sortField, sortOrder, handleSort, setSort,
        // utils
        resetFilters, hasActiveFilters,
    };
}
