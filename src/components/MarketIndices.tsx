'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';

const INDICES = [
    { ticker: 'SPY', name: 'S&P 500' },
    { ticker: 'QQQ', name: 'NASDAQ' },
    { ticker: 'DIA', name: 'DOW' }
];

export function MarketIndices() {
    const [data, setData] = useState<Record<string, StockData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchIndices = async () => {
            try {
                const tickers = INDICES.map(i => i.ticker).join(',');
                // Using project=pmp to match default behavior, though strictly not needed if just fetching raw tickers
                const res = await fetch(`/api/stocks?tickers=${tickers}`);
                if (!res.ok) throw new Error('Failed to fetch');

                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    const map: Record<string, StockData> = {};
                    json.data.forEach((stock: StockData) => {
                        map[stock.ticker] = stock;
                    });
                    setData(map);
                }
            } catch (err) {
                console.error('Failed to fetch market indices', err);
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        // Auto-refresh every minute
        const interval = setInterval(fetchIndices, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="market-indicators-section">
            <div className="market-indicators-container">
                <div className="market-indicators">
                    {INDICES.map(({ ticker, name }) => {
                        const stock = data[ticker];
                        const price = stock?.currentPrice;
                        const change = stock?.percentChange;
                        // Default to positive (green) if 0 or unknown, similar to placeholder style
                        const isPositive = (change || 0) >= 0;

                        return (
                            <div key={ticker} className="market-indicator animate-in fade-in duration-500">
                                <div className="indicator-header">
                                    <h3 className="indicator-name">{name}</h3>
                                    <span className="indicator-symbol">{ticker}</span>
                                </div>
                                <div className="indicator-values">
                                    <div className="indicator-price">
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-6 w-24 block rounded"></span>
                                        ) : (
                                            `$${formatPrice(price)}`
                                        )}
                                    </div>
                                    <div className={`indicator-change ${isPositive ? 'positive' : 'negative'}`}>
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 block rounded mt-1"></span>
                                        ) : (
                                            <span>{formatPercent(change)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
