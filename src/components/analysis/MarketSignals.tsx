'use client';

import React, { useState, useEffect } from 'react';

interface Alert {
    symbol: string;
    lastQualitySignalAt: string;
    healthScore: number;
    altmanZ: number;
    ticker: {
        name: string;
        logoUrl: string | null;
        lastPrice: number | null;
    };
}

export function MarketSignals() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAlerts = async () => {
        try {
            const res = await fetch('/api/analysis/alerts');
            const data = await res.json();
            setAlerts(data.alerts || []);
        } catch (error) {
            console.error('Failed to fetch alerts:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const handleTickerClick = (symbol: string) => {
        const event = new CustomEvent('mobile-nav-change', {
            detail: { tab: 'analysis', ticker: symbol }
        });
        window.dispatchEvent(event);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 animate-pulse">
                <div className="text-gray-400">Loading intelligence signals...</div>
            </div>
        );
    }

    if (alerts.length === 0) {
        return null; // Don't show if no recent signals
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Real-Time Intelligence</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {alerts.map((alert) => (
                    <div
                        key={alert.symbol}
                        onClick={() => handleTickerClick(alert.symbol)}
                        className="group bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 shadow-sm transition-all cursor-pointer relative overflow-hidden"
                    >
                        {/* Status Badge */}
                        <div className="absolute top-0 right-0 px-3 py-1 bg-blue-600 text-[10px] font-bold text-white rounded-bl-lg uppercase tracking-tight">
                            Quality Breakout
                        </div>

                        <div className="flex items-center gap-3 mb-3">
                            {alert.ticker.logoUrl ? (
                                <img src={alert.ticker.logoUrl} alt="" className="w-10 h-10 rounded-full bg-gray-50 p-1" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center font-bold text-blue-600">
                                    {alert.symbol[0]}
                                </div>
                            )}
                            <div>
                                <div className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">{alert.symbol}</div>
                                <div className="text-[10px] text-gray-400 truncate max-w-[150px]">{alert.ticker.name}</div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-50 dark:border-gray-700/50">
                            <div className="flex flex-col">
                                <span className="text-[9px] uppercase text-gray-400 font-semibold">Health</span>
                                <span className="text-sm font-bold text-green-500">{alert.healthScore}</span>
                            </div>
                            <div className="flex flex-col text-center">
                                <span className="text-[9px] uppercase text-gray-400 font-semibold">Altman Z</span>
                                <span className="text-sm font-bold text-blue-500">{alert.altmanZ?.toFixed(2)}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[9px] uppercase text-gray-400 font-semibold">Price</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">${alert.ticker.lastPrice?.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Relative Time */}
                        <div className="mt-2 text-[9px] text-gray-400 italic">
                            Signal detected {new Date(alert.lastQualitySignalAt).toLocaleDateString()}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
