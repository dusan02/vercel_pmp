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
    selectedSectors: string[];
    selectedIndustries: string[];
    onSectorsChange: (value: string[]) => void;
    onIndustriesChange: (value: string[]) => void;
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
    selectedSectors,
    selectedIndustries,
    onSectorsChange,
    onIndustriesChange,
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
                selectedSectors={selectedSectors}
                selectedIndustries={selectedIndustries}
                onSectorsChange={onSectorsChange}
                onIndustriesChange={onIndustriesChange}
                uniqueSectors={uniqueSectors}
                availableIndustries={availableIndustries}
            />
        </SectionErrorBoundary>
    );
}
