import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { FavoritesSection } from '../FavoritesSection';
import { StockData } from '@/lib/types';
import { SortKey } from '@/hooks/useSortableData';

interface HomeFavoritesProps {
    favoriteStocks: StockData[];
    loading: boolean;
    sortKey: SortKey | null;
    ascending: boolean;
    onSort: (key: SortKey) => void;
    onToggleFavorite: (ticker: string) => void;
    isFavorite: (ticker: string) => boolean;
}

export function HomeFavorites({
    favoriteStocks,
    loading,
    sortKey,
    ascending,
    onSort,
    onToggleFavorite,
    isFavorite
}: HomeFavoritesProps) {
    return (
        <SectionErrorBoundary sectionName="Favorites">
            <FavoritesSection
                favoriteStocks={favoriteStocks}
                loading={loading}
                sortKey={sortKey}
                ascending={ascending}
                onSort={onSort}
                onToggleFavorite={onToggleFavorite}
                isFavorite={isFavorite}
            />
        </SectionErrorBoundary>
    );
}
