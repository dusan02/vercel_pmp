'use client';

import React, { useState } from 'react';
import { LineChart, LayoutGrid, PieChart, BarChart2 } from 'lucide-react';
import { PortfolioPerformanceChart } from '../PortfolioPerformanceChart';
import { PortfolioPerformanceTreemap } from '../PortfolioTreemapNew';
import { PortfolioSectorDistributionChart } from '../PortfolioSectorDistributionChart';
import { PortfolioStockDistributionChart } from '../PortfolioStockDistributionChart';

interface PortfolioMobileChartsProps {
  holdings: Record<string, number>;
  chartData: Array<{
    ticker: string;
    value: number;
    dailyChangePercent: number;
    dailyChangeValue: number;
    totalReturnPercent?: number | null;
    totalPnl?: number | null;
    sector: string;
    industry: string;
  }>;
}

type ChartTab = 'performance' | 'treemap' | 'sectors' | 'allocation';

export function PortfolioMobileCharts({ holdings, chartData }: PortfolioMobileChartsProps) {
  const [activeChart, setActiveChart] = useState<ChartTab>('performance');

  const tabs: Array<{ id: ChartTab; label: string; icon: React.ReactNode }> = [
    { id: 'performance', label: 'History', icon: <LineChart size={14} /> },
    { id: 'treemap', label: 'Treemap', icon: <LayoutGrid size={14} /> },
    { id: 'sectors', label: 'Sectors', icon: <PieChart size={14} /> },
    { id: 'allocation', label: 'Holdings', icon: <BarChart2 size={14} /> },
  ];

  return (
    <div className="space-y-4">
      {/* Segmented Selector for Charts */}
      <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-800 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveChart(tab.id)}
            className={`flex-1 min-w-[75px] py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
              activeChart === tab.id
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Active Chart Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
        {activeChart === 'performance' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Portfolio vs. S&P 500 Performance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Normalized comparison over time
              </p>
            </div>
            <PortfolioPerformanceChart holdings={holdings} />
          </div>
        )}

        {activeChart === 'treemap' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Performance Treemap
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tile area represents dollar move · Color shows % move
              </p>
            </div>
            <PortfolioPerformanceTreemap data={chartData} />
          </div>
        )}

        {activeChart === 'sectors' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Sector Allocation
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Industry and sector diversification
              </p>
            </div>
            <PortfolioSectorDistributionChart data={chartData} />
          </div>
        )}

        {activeChart === 'allocation' && (
          <div>
            <div className="mb-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Holdings Breakdown
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Position weights across individual assets
              </p>
            </div>
            <PortfolioStockDistributionChart data={chartData} />
          </div>
        )}
      </div>
    </div>
  );
}
