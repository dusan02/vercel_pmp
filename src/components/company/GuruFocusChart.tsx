'use client';

import React, { useState, useEffect } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import { format } from 'date-fns';

interface GuruFocusDataPoint {
  date: string;
  value: number;
  median?: number;
  percentile10?: number;
  percentile90?: number;
  isExpensive?: boolean;
  isCheap?: boolean;
}

interface GuruFocusChartProps {
  symbol: string;
  metric?: keyof typeof METRIC_CONFIG;
  years?: number;
  height?: number;
}

const METRIC_CONFIG = {
  peRatio: { label: 'P/E Ratio', unit: 'x', color: '#3b82f6' },
  psRatio: { label: 'P/S Ratio', unit: 'x', color: '#10b981' },
  pbRatio: { label: 'P/B Ratio', unit: 'x', color: '#f59e0b' },
  evEbitda: { label: 'EV/EBIT', unit: 'x', color: '#8b5cf6' },
  fcfYield: { label: 'FCF Yield', unit: '%', color: '#06b6d4' },
  evRevenue: { label: 'EV/Revenue', unit: 'x', color: '#ec4899' },
  evFcf: { label: 'EV/FCF', unit: 'x', color: '#f97316' },
  priceTangibleBook: { label: 'P/Tangible Book', unit: 'x', color: '#84cc16' },
  pegRatio: { label: 'PEG Ratio', unit: 'x', color: '#6366f1' },
  dividendYield: { label: 'Dividend Yield', unit: '%', color: '#14b8a6' },
  roic: { label: 'ROIC', unit: '%', color: '#a855f7' },
  roe: { label: 'ROE', unit: '%', color: '#ef4444' },
  debtToEquity: { label: 'Debt/Equity', unit: 'x', color: '#facc15' },
  currentRatio: { label: 'Current Ratio', unit: 'x', color: '#22c55e' },
  quickRatio: { label: 'Quick Ratio', unit: 'x', color: '#0ea5e9' }
} as const;

const YEARS_OPTIONS = [
  { value: 5, label: '5 rokov' },
  { value: 10, label: '10 rokov' },
  { value: 15, label: '15 rokov' },
  { value: 20, label: '20 rokov' }
];

export default function GuruFocusChart({ 
  symbol, 
  metric = 'peRatio', 
  years = 10,
  height = 400 
}: GuruFocusChartProps) {
  const [data, setData] = useState<GuruFocusDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYears, setSelectedYears] = useState(years);
  const [selectedMetric, setSelectedMetric] = useState(metric);

  const config = METRIC_CONFIG[selectedMetric];

  // Načítanie dát
  useEffect(() => {
    loadData();
  }, [symbol, selectedMetric, selectedYears]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/gurufocus/${symbol}?metric=${selectedMetric}&years=${selectedYears}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load GuruFocus data');
      }
      
      const result = await response.json();
      setData(result.data.chartData);
    } catch (err) {
      console.error('❌ Error loading GuruFocus data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Custom Tooltip v GuruFocus štýle
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <p className="font-semibold text-sm mb-2">{label}</p>
          
          <div className="space-y-1">
            <p className="text-sm">
              <span className="font-medium" style={{ color: config.color }}>
                {config.label}:
              </span>{' '}
              <span className="font-mono">
                {data.value.toFixed(2)}{config.unit}
              </span>
            </p>
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Median: <span className="font-mono">{data.median?.toFixed(2)}{config.unit}</span>
            </p>
            
            <div className="pt-1 border-t border-gray-200 dark:border-gray-700 mt-2">
              <p className="text-xs text-red-600 dark:text-red-400">
                90th: <span className="font-mono">{data.percentile90?.toFixed(2)}{config.unit}</span>
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                10th: <span className="font-mono">{data.percentile10?.toFixed(2)}{config.unit}</span>
              </p>
            </div>
            
            {data.isExpensive && (
              <div className="mt-2 px-2 py-1 bg-red-100 dark:bg-red-900 rounded text-xs text-red-800 dark:text-red-200">
                💰 Expensive (Top 10%)
              </div>
            )}
            
            {data.isCheap && (
              <div className="mt-2 px-2 py-1 bg-green-100 dark:bg-green-900 rounded text-xs text-green-800 dark:text-green-200">
                💰 Cheap (Bottom 10%)
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Formátovanie osí
  const formatXAxis = (tickItem: string) => {
    const date = new Date(tickItem);
    return format(date, selectedYears <= 5 ? 'MMM yy' : 'yyyy');
  };

  const formatYAxis = (value: number) => {
    return `${value.toFixed(1)}${config.unit}`;
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Načítavam GuruFocus dáta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="text-red-500 mb-2">
            <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">{error}</p>
          <button 
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Skúsiť znova
          </button>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Žiadne GuruFocus dáta pre {symbol}
          </p>
          <button 
            onClick={() => fetch(`/api/gurufocus/${symbol}`, { method: 'POST' })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
          Aktualizovať metriky
          </button>
        </div>
      </div>
    );
  }

  const currentData = data[data.length - 1];
  const isExpensive = currentData?.isExpensive;
  const isCheap = currentData?.isCheap;

  return (
    <div className="w-full">
      {/* GuruFocus štýl header */}
      <div className="bg-white dark:bg-gray-800 rounded-t-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GF</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                GuruFocus Valuation Analysis
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Professional valuation metrics with percentile analysis
              </p>
            </div>
          </div>
          
          {/* Valuation status */}
          {isExpensive && (
            <div className="px-3 py-2 bg-red-100 dark:bg-red-900 rounded-lg">
              <span className="text-red-800 dark:text-red-200 font-medium text-sm">
                💰 EXPENSIVE
              </span>
            </div>
          )}
          
          {isCheap && (
            <div className="px-3 py-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <span className="text-green-800 dark:text-green-200 font-medium text-sm">
                💰 CHEAP
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Kontrolky */}
      <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2">
            {Object.entries(METRIC_CONFIG).slice(0, 8).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key as any)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedMetric === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
                style={selectedMetric === key ? { backgroundColor: cfg.color } : {}}
              >
                {cfg.label}
              </button>
            ))}
          </div>
          
          <div className="flex gap-2">
            {YEARS_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => setSelectedYears(option.value)}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  selectedYears === option.value
                    ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-800'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Štatistiky */}
      <div className="bg-white dark:bg-gray-800 border-x border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-600 dark:text-gray-400">Aktuálne:</span>
            <span className="ml-2 font-mono font-medium">
              {currentData?.value.toFixed(2)}{config.unit}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">Median:</span>
            <span className="ml-2 font-mono">
              {currentData?.median?.toFixed(2)}{config.unit}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">10th %:</span>
            <span className="ml-2 font-mono text-green-600 dark:text-green-400">
              {currentData?.percentile10?.toFixed(2)}{config.unit}
            </span>
          </div>
          <div>
            <span className="text-gray-600 dark:text-gray-400">90th %:</span>
            <span className="ml-2 font-mono text-red-600 dark:text-red-400">
              {currentData?.percentile90?.toFixed(2)}{config.unit}
            </span>
          </div>
        </div>
      </div>

      {/* GuruFocus štýl graf */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b-xl p-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:stroke-gray-700" />
            
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={60}
            />
            
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fontSize: 12, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* GuruFocus štýl percentilové pásmo */}
            <Area
              type="monotone"
              dataKey="percentile90"
              stroke="#fca5a5"
              fill="#fef2f2"
              fillOpacity={0.4}
              strokeWidth={1}
              name="Top 10%"
            />
            
            <Area
              type="monotone"
              dataKey="percentile10"
              stroke="#86efac"
              fill="#f0fdf4"
              fillOpacity={0.4}
              strokeWidth={1}
              name="Bottom 10%"
            />
            
            {/* Median */}
            <Line
              type="monotone"
              dataKey="median"
              stroke="#9ca3af"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="Median"
            />
            
            {/* Hlavná hodnota */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={config.color}
              strokeWidth={2.5}
              dot={false}
              name={config.label}
            />
            
            {/* GuruFocus štýl reference lines */}
            {currentData?.percentile90 && (
              <ReferenceLine
                y={currentData.percentile90}
                stroke="#fca5a5"
                strokeDasharray="8 4"
                strokeWidth={1.5}
                label="Top 10%"
              />
            )}
            
            {currentData?.percentile10 && (
              <ReferenceLine
                y={currentData.percentile10}
                stroke="#86efac"
                strokeDasharray="8 4"
                strokeWidth={1.5}
                label="Bottom 10%"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* GuruFocus štýl footer */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mt-4">
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700"></div>
              <span>Horných 10% (Drahé)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700"></div>
              <span>Dolných 10% (Lacné)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 border-b-2 border-gray-400" style={{ borderBottomStyle: 'dashed' }}></div>
              <span>Median</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5" style={{ backgroundColor: config.color }}></div>
            <span>{config.label}</span>
          </div>
        </div>
        
        <div className="mt-2 text-center">
          <p className="text-xs">
            📊 GuruFocus Style Analysis • {data.length} data points • {selectedYears} years history
          </p>
        </div>
      </div>
    </div>
  );
}
