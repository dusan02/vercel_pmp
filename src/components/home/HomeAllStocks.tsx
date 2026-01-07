import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { AllStocksSection } from '../AllStocksSection';
import { StockData } from '@/lib/types';
import { SortKey } from '@/hooks/useSortableData';

interface HomeAllStocksProps {
    displayedStocks: StockData[];
    loading: boolean;
    sortKey: SortKey | null;
    ascending: boolean;
    onSort: (key: SortKey) => void;
    onToggleFavorite: (ticker: string) => void;
    isFavorite: (ticker: string) => boolean;
    searchTerm: string;
    onSearchChange: (value: string) => void;
    hasMore: boolean;
    onLoadMore?: () => void;
    isLoadingMore?: boolean;
    totalCount?: number;
    selectedSector: string;
    selectedIndustry: string;
    onSectorChange: (value: string) => void;
    onIndustryChange: (value: string) => void;
    uniqueSectors: string[];
    availableIndustries: string[];
}

export function HomeAllStocks({
    displayedStocks,
    loading,
    sortKey,
    ascending,
    onSort,
    onToggleFavorite,
    isFavorite,
    searchTerm,
    onSearchChange,
    hasMore,
    onLoadMore,
    isLoadingMore,
    totalCount,
    selectedSector,
    selectedIndustry,
    onSectorChange,
    onIndustryChange,
    uniqueSectors,
    availableIndustries
}: HomeAllStocksProps) {
    return (
        <SectionErrorBoundary sectionName="All Stocks">
            <AllStocksSection
                displayedStocks={displayedStocks}
                loading={loading}
                sortKey={sortKey}
                ascending={ascending}
                onSort={onSort}
                onToggleFavorite={onToggleFavorite}
                isFavorite={isFavorite}
                searchTerm={searchTerm}
                onSearchChange={onSearchChange}
                hasMore={hasMore}
                {...(onLoadMore ? { onLoadMore } : {})}
                {...(typeof isLoadingMore === 'boolean' ? { isLoadingMore } : {})}
                {...(typeof totalCount === 'number' ? { totalCount } : {})}
                selectedSector={selectedSector}
                selectedIndustry={selectedIndustry}
                onSectorChange={onSectorChange}
                onIndustryChange={onIndustryChange}
                uniqueSectors={uniqueSectors}
                availableIndustries={availableIndustries}
            />
        </SectionErrorBoundary>
    );
}
