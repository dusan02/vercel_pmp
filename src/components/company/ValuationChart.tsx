'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend
} from 'recharts';
import { format } from 'date-fns';

interface ValuationDataPoint {
  date: Date;
  value: number;
  percentile?: number;
  p10?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  period: 'monthly' | 'daily';
}

interface ValuationChartProps {
  symbol: string;
  metric?: 'pe_ratio' | 'pb_ratio' | 'ps_ratio' | 'ev_ebitda';
  period?: '10y' | '5y' | '1y';
  height?: number;
}

const METRIC_CONFIG = {
  pe_ratio: {
    label: 'P/E Ratio',
    color: '#3b82f6',
    unit: 'x'
  },
  pb_ratio: {
    label: 'P/B Ratio', 
    color: '#10b981',
    unit: 'x'
  },
  ps_ratio: {
    label: 'P/S Ratio',
    color: '#f59e0b',
    unit: 'x'
  },
  ev_ebitda: {
    label: 'EV/EBIT',
    formatter: (val: number) => `${val.toFixed(1)}x`,
    domain: ['auto', 'auto'],
    color: '#8b5cf6',
    unit: 'x'
  }
};

const PERIOD_OPTIONS = [
  { value: '10y', label: '10 rokov' },
  { value: '5y', label: '5 rokov' },
  { value: '1y', label: '1 rok' }
];

export default function ValuationChart({ 
  symbol, 
  metric = 'pe_ratio', 
  period = '10y',
  height = 400 
}: ValuationChartProps) {
  const [data, setData] = useState<ValuationDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [selectedMetric, setSelectedMetric] = useState(metric);

  const config = METRIC_CONFIG[selectedMetric];

  // Načítanie dát
  useEffect(() => {
    loadData();
  }, [symbol, selectedMetric, selectedPeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/valuation/${symbol}?metric=${selectedMetric}&period=${selectedPeriod}`
      );
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load valuation data');
      }
      
      const result = await response.json();
      
      // Konverzia string dátumov na Date objekty
      const processedData = result.data.chartData.map((point: any) => ({
        ...point,
        date: new Date(point.date)
      }));
      
      setData(processedData);
    } catch (err) {
      console.error('❌ Error loading valuation data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Formátovanie dát pre graf
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    
    return data.map(point => ({
      date: point.date,
      value: point.value,
      p10: point.p10,
      p25: point.p25,
      p50: point.p50,
      p75: point.p75,
      p90: point.p90,
      percentile: point.percentile,
      // Formátované hodnoty pre tooltip
      displayDate: format(point.date, selectedPeriod === '1y' ? 'MMM dd' : 'MMM yyyy'),
      formattedValue: point.value.toFixed(2)
    }));
  }, [data, selectedPeriod]);

  // Custom Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 dark:bg-gray-800 dark:border-gray-700">
          <p className="font-semibold text-sm mb-2">{data.displayDate}</p>
          
          <div className="space-y-1">
            <p className="text-sm">
              <span className="font-medium" style={{ color: config.color }}>
                {config.label}:
              </span>{' '}
              <span className="font-mono">{data.formattedValue}{config.unit}</span>
            </p>
            
            {data.percentile && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Percentil: <span className="font-mono">{data.percentile.toFixed(1)}%</span>
              </p>
            )}
            
            <div className="pt-1 border-t border-gray-200 dark:border-gray-700 mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                10%: <span className="font-mono">{data.p10?.toFixed(2)}{config.unit}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                90%: <span className="font-mono">{data.p90?.toFixed(2)}{config.unit}</span>
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Formátovanie X-osi
  const formatXAxis = (tickItem: Date) => {
    return format(tickItem, selectedPeriod === '1y' ? 'MMM' : 'MMM yyyy');
  };

  // Formátovanie Y-osi
  const formatYAxis = (value: number) => {
    return `${value.toFixed(1)}${config.unit}`;
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Načítavam valučné dáta...</p>
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

  if (chartData.length === 0) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            Žiadne valučné dáta pre {symbol}
          </p>
          <button 
            onClick={() => fetch(`/api/valuation/${symbol}`, { method: 'POST' })}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Zozbierať dáta
          </button>
        </div>
      </div>
    );
  }

  const currentPercentile = chartData[chartData.length - 1]?.percentile;
  const isInTop10 = currentPercentile && currentPercentile >= 90;
  const isInBottom10 = currentPercentile && currentPercentile <= 10;

  return (
    <div className="w-full">
      {/* Kontrolky */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="flex gap-2">
          {Object.entries(METRIC_CONFIG).map(([key, cfg]) => (
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
          {PERIOD_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setSelectedPeriod(option.value as any)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === option.value
                  ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-800'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indikátory */}
      {currentPercentile && (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Aktuálna pozícia:</span>
              <span className={`text-sm font-bold ${
                isInTop10 ? 'text-red-600 dark:text-red-400' : 
                isInBottom10 ? 'text-green-600 dark:text-green-400' : 
                'text-gray-700 dark:text-gray-300'
              }`}>
                {currentPercentile.toFixed(1)}. percentil
              </span>
              {isInTop10 && (
                <span className="text-xs bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 px-2 py-1 rounded">
                  Horných 10%
                </span>
              )}
              {isInBottom10 && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-1 rounded">
                  Dolných 10%
                </span>
              )}
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Rozsah dát: {chartData.length} bodov
            </div>
          </div>
        </div>
      )}

      {/* Graf */}
      <div className="w-full bg-white dark:bg-gray-900 rounded-lg p-4" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
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
              width={60}
            />
            
            <Tooltip content={<CustomTooltip />} />
            
            {/* Horné 10% pásmo */}
            <Area
              type="monotone"
              dataKey="p90"
              stroke="#fca5a5"
              fill="#fef2f2"
              fillOpacity={0.6}
              strokeWidth={1}
              name="Top 10%"
            />
            
            {/* Dolné 10% pásmo */}
            <Area
              type="monotone"
              dataKey="p10"
              stroke="#86efac"
              fill="#f0fdf4"
              fillOpacity={0.6}
              strokeWidth={1}
              name="Bottom 10%"
            />
            
            {/* Median */}
            <Line
              type="monotone"
              dataKey="p50"
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
              strokeWidth={2}
              dot={false}
              name={config.label}
            />
            
            {/* Horná 10% hranica */}
            {chartData[0]?.p90 && (
              <ReferenceLine
                y={chartData[0].p90}
                stroke="#fca5a5"
                strokeDasharray="5 5"
                strokeWidth={1}
                label="Top 10%"
              />
            )}
            
            {/* Dolná 10% hranica */}
            {chartData[0]?.p10 && (
              <ReferenceLine
                y={chartData[0].p10}
                stroke="#86efac"
                strokeDasharray="5 5"
                strokeWidth={1}
                label="Bottom 10%"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700"></div>
          <span>Horných 10%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700"></div>
          <span>Dolných 10%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-b-2 border-gray-400" style={{ borderBottomStyle: 'dashed' }}></div>
          <span>Median</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5" style={{ backgroundColor: config.color }}></div>
          <span>{config.label}</span>
        </div>
      </div>
    </div>
  );
}
