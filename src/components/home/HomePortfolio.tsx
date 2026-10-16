import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { PortfolioSection } from '../PortfolioSection';
import { StockData } from '@/lib/types';

interface HomePortfolioProps {
    portfolioStocks: StockData[];
    portfolioHoldings: Record<string, number>;
    costBasis?: Record<string, number>;
    allStocks: StockData[];
    loading: boolean;
    onUpdateQuantity: (ticker: string, quantity: number) => void;
    onUpdateCostBasis?: (ticker: string, avgPrice: number) => void;
    onRemoveStock: (ticker: string) => void;
    onAddStock: (ticker: string, quantity?: number) => void;
    calculatePortfolioValue: (stock: StockData) => number;
    calculateTotalValue?: (stock: StockData) => number;
    totalPortfolioValue: number;
}

export function HomePortfolio({
    portfolioStocks,
    portfolioHoldings,
    costBasis,
    allStocks,
    loading,
    onUpdateQuantity,
    onUpdateCostBasis,
    onRemoveStock,
    onAddStock,
    calculatePortfolioValue,
    calculateTotalValue,
    totalPortfolioValue
}: HomePortfolioProps) {
    return (
        <SectionErrorBoundary sectionName="Portfolio">
            <PortfolioSection
                portfolioStocks={portfolioStocks}
                portfolioHoldings={portfolioHoldings}
                costBasis={costBasis}
                allStocks={allStocks}
                loading={loading}
                onUpdateQuantity={onUpdateQuantity}
                onUpdateCostBasis={onUpdateCostBasis}
                onRemoveStock={onRemoveStock}
                onAddStock={onAddStock}
                calculatePortfolioValue={calculatePortfolioValue}
                calculateTotalValue={calculateTotalValue}
                totalPortfolioValue={totalPortfolioValue}
            />
        </SectionErrorBoundary>
    );
}
