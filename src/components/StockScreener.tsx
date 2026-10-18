'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { DualRangeSlider } from './analysis/DualRangeSlider';
import { useScreener } from '@/hooks/useScreener';
import { useSavedScreens, MAX_SAVED_SCREENS } from '@/hooks/useSavedScreens';
import { LivePrice } from './LivePrice';
import {
  ScreenerResult, scoreColor, altmanZLabel, piotroskiLabel, beneishLabel, fcfMarginLabel, debtRepayLabel,
  SORT_OPTIONS, SECTORS, MARKET_CAP_PRESETS, METRIC_FILTERS, MARKET_RANGE_FILTERS, INSIDER_RANGE_FILTERS, ANALYSIS_RANGE_FILTERS, RANGE_FILTERS, RangeFilterKey, QUICK_SCREENS, PRESET_GROUPS,
  SCORE_FILTERS, ADVANCED_FILTERS, VERDICT_FILTERS, matchesPreset,
} from '@/lib/utils/screener';
import { Sparkline } from './Sparkline';
import VerdictMatrix from './VerdictMatrix';
import { formatBillions, formatMarketCapDiff, formatCurrencyCompact } from '@/lib/utils/format';
import { useState, useEffect } from 'react';

// Column views — thematic subsets of the full column set. Every view opens
// with the same identity block (Company · 1Y · Price · Change% · MktCap) so a
// row is never bare numbers without market context; only the trailing columns
// change per theme. Filters/sort are view-independent — switching a tab never
// changes the dataset. Tab order runs general → specialised.
const COLUMN_VIEWS = [
  { id: 'overview', label: 'Overview', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'overallScore', 'valuationScore', 'growthScore', 'profitabilityScore', 'healthScore', 'qualityScore', 'moatScore', 'screens'] },
  { id: 'market', label: 'Market', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'ticker.sector', 'ticker.employees', 'ticker.lastMarketCapDiff', 'ticker.latestMoversRVOL', 'ticker.stdDevReturn20d', 'analyst.buy'] },
  { id: 'metrics', label: 'Metrics', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'metrics.roe', 'roic', 'metrics.operatingMargin', 'metrics.revenueGrowth', 'revenueCagr', 'netIncomeCagr', 'epsCagr5y', 'metrics.peRatio', 'pePercentile', 'peVsMedian3yPct', 'metrics.priceFreeCashFlow', 'priceToCash', 'metrics.dividendYield', 'metrics.payoutRatio', 'metrics.beta', 'metrics.week52Position', 'trendSignal'] },
  { id: 'technical', label: 'Technical', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'rsi14', 'sma20Pct', 'sma50Pct', 'sma200Pct', 'perf1m', 'perf3m', 'perf6m', 'perfYtd', 'perf1y', 'metrics.week52Position', 'ticker.latestMoversRVOL', 'ticker.stdDevReturn20d'] },
  { id: 'risk', label: 'Risk & Quality', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'altmanZ', 'piotroskiScore', 'beneishScore', 'fcfMargin', 'fcfConversion', 'marginStability', 'debtRepaymentYears', 'healthScore', 'qualityScore', 'overallScore'] },
  { id: 'insiders', label: 'Insiders', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'insider.netBuyValue90d', 'insider.largestBuyValue90d', 'insider.largestSellValue90d', 'insider.uniqueSellers14d', 'overallScore'] },
  { id: 'all', label: 'All columns', keys: null }, // null = every defined column
  { id: 'custom', label: 'Custom', keys: null },   // user-defined ordered set
] as const;

/** Plain-text labels for the column picker (column headers contain icons). */
const COLUMN_LABELS: Record<string, string> = {
  'ticker.name': 'Company',
  'ticker.sector': 'Sector',
  'sector': 'Sector',
  'sparkline': '1Y Chart',
  'ticker.lastPrice': 'Price',
  'ticker.lastChangePct': 'Change %',
  'ticker.lastMarketCap': 'Market Cap',
  'ticker.lastMarketCapDiff': 'Mkt Cap Δ',
  'ticker.employees': 'Employees',
  'ticker.latestMoversRVOL': 'Rel. Volume',
  'ticker.stdDevReturn20d': 'Volatility 20D',
  'analyst.buy': 'Analysts',
  'analysts': 'Analysts',
  'debtRepaymentYears': 'Debt Repay',
  'revenueCagr': 'Rev CAGR 5Y',
  'netIncomeCagr': 'NI CAGR 5Y',
  'epsCagr5y': 'EPS CAGR 5Y',
  'roic': 'ROIC %',
  'priceToCash': 'P/Cash',
  'rsi14': 'RSI (14)',
  'sma20Pct': 'vs SMA 20',
  'sma50Pct': 'vs SMA 50',
  'sma200Pct': 'vs SMA 200',
  'perf1m': 'Perf 1M',
  'perf3m': 'Perf 3M',
  'perf6m': 'Perf 6M',
  'perfYtd': 'Perf YTD',
  'perf1y': 'Perf 1Y',
  'fcfConversion': 'FCF Conv.',
  'marginStability': 'Margin σ',
  'pePercentile': 'P/E %ile vs Hist',
  'peVsMedian3yPct': 'P/E vs 3Y Med',
  'overallScore': 'Overall',
  'valuationScore': 'Valuation',
  'growthScore': 'Growth',
  'profitabilityScore': 'Profitability',
  'healthScore': 'Health',
  'qualityScore': 'Quality',
  'moatScore': 'Moat',
  'altmanZ': 'Altman Z',
  'piotroskiScore': 'Piotroski F',
  'beneishScore': 'Beneish M',
  'fcfMargin': 'FCF Margin',
  'insider.netBuyValue90d': 'Insider Net 90D',
  'insider.largestBuyValue90d': 'Top Insider Buy',
  'insider.largestSellValue90d': 'Top Insider Sell',
  'insider.uniqueSellers14d': 'Insider Cluster 14D',
  'screens': 'Matched Screens',
  'trendSignal': 'Fund. Trend',
};
const columnLabel = (key: string) =>
  COLUMN_LABELS[key]
  ?? METRIC_FILTERS.find((d) => `metrics.${d.key}` === key)?.label
  ?? key;

/** All slider-rendered range defs (Finnhub metrics + our analysis metrics) —
    grouped by `group` so each registry adds its section automatically. */
const SLIDER_DEFS: { key: RangeFilterKey; label: string; min: number; max: number; step: number; group: string; hint?: string }[] = [
  ...MARKET_RANGE_FILTERS,
  ...METRIC_FILTERS,
  ...ANALYSIS_RANGE_FILTERS,
];
const SLIDER_GROUPS = [...new Set(SLIDER_DEFS.map((d) => d.group))];
// Quick-screen presets rendered in the dropdown — the verdict group renders
// as the VerdictMatrix grid instead (cell = exact verdict, axes = atomics).
const PRESET_OPTIONS = QUICK_SCREENS.filter((s) => s.group !== 'verdict');
// Company is the row identifier — always first, never removable.
const PINNED_COLUMN = 'ticker.name';

type ColumnViewId = (typeof COLUMN_VIEWS)[number]['id'];

// Score = number + micro-bar so values scan visually, not just numerically.
const scoreBar = (v: number) =>
  v >= 70 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-400' : v >= 30 ? 'bg-orange-400' : 'bg-rose-500';
const ScoreCell = ({ v, bold }: { v: number | null; bold?: boolean }) =>
  v == null ? <span className="text-gray-400">-</span> : (
    <span className="inline-flex flex-col items-end gap-0.5" title={`${v.toFixed(0)} / 100`}>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${scoreColor(v)}`}>{v.toFixed(0)}</span>
      <span className="h-1 w-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <span className={`block h-full rounded-full ${scoreBar(v)}`} style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </span>
    </span>
  );

export default function StockScreener({ initialData }: { initialData?: any[] }) {
  const router = useRouter();
  const screener = useScreener({ initialLimit: 25, defaultMinHealth: 0, defaultMinProfit: 0, defaultMinValue: 0, initialData });
  const {
    results, pagination, loading, page, setPage,
    scoreRanges, setScoreRange,
    advanced, setAdvancedValue,
    selectedSector, setSelectedSector,
    selectedIndustry, setSelectedIndustry,
    searchQuery, setSearchQuery,
    industries,
    marketCapPreset, setMarketCapPreset,
    trendConfirmed, setTrendConfirmed,
    verdictFilters, setVerdictFilter,
    metricRanges, setMetricRange,
    sortField, sortOrder, handleSort, setSort,
    resetFilters, hasActiveFilters, applyPreset,
    buildParamsString, restoreFromParams, isPresetActive,
  } = screener;
  const savedScreens = useSavedScreens();
  const [screenName, setScreenName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleTickerClick = (ticker: string) => {
    router.push(`/analysis/${ticker}`);
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300 dark:text-gray-600" />;
    return sortOrder === 'asc'
      ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
      : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
  };

  const allColumns: ColumnDef<ScreenerResult>[] = useMemo(() => [
    {
      key: 'ticker.name',
      header: <>Company <SortIcon field="ticker.name" /></>,
      align: 'left',
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center shrink-0">
            <CompanyLogo ticker={r.symbol} size={32} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white">{r.symbol}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-32">
              {r.ticker?.name || r.symbol}
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'ticker.sector',
      header: <>Sector <SortIcon field="ticker.sector" /></>,
      align: 'left',
      sortable: true,
      render: (r) => <span className="text-xs text-gray-600 dark:text-gray-300">{r.ticker?.sector || '-'}</span>
    },
    {
      key: 'ticker.employees',
      header: <>Employees <SortIcon field="ticker.employees" /></>,
      align: 'right',
      sortable: true,
      render: (r) => (
        <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
          {r.ticker?.employees != null ? r.ticker.employees.toLocaleString('en-US') : '-'}
        </span>
      )
    },
    {
      // Analyst consensus — buy-side share of the latest rating counts.
      // Sorts by raw buy count (analyst.buy) — a workable proxy for "most
      // loved" that stays orderBy-able on the relation.
      key: 'analyst.buy',
      header: <>Analysts <SortIcon field="analyst.buy" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const a = r.analysts;
        if (!a) return <span className="text-gray-400">-</span>;
        const total = (a.strongBuy ?? 0) + (a.buy ?? 0) + (a.hold ?? 0) + (a.sell ?? 0) + (a.strongSell ?? 0);
        if (total === 0) return <span className="text-gray-400">-</span>;
        const buyPct = Math.round((((a.strongBuy ?? 0) + (a.buy ?? 0)) / total) * 100);
        const sellN = (a.sell ?? 0) + (a.strongSell ?? 0);
        return (
          <span
            className={`text-sm font-semibold tabular-nums ${buyPct >= 60 ? 'text-green-600 dark:text-green-400' : buyPct >= 40 ? 'text-gray-700 dark:text-gray-200' : 'text-red-600 dark:text-red-400'}`}
            title={`${buyPct}% buy-side of ${total} ratings — ${a.strongBuy ?? 0} SB · ${a.buy ?? 0} B · ${a.hold ?? 0} H · ${a.sell ?? 0} S · ${a.strongSell ?? 0} SS`}
          >
            {buyPct}%{sellN > 0 ? <span className="ml-1 text-[10px] font-medium text-red-500">↓{sellN}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'sparkline',
      header: '1Y',
      align: 'center',
      sortable: false,
      render: (r) => (
        <div title="1-year weekly close trend">
          <Sparkline data={r.sparkline} />
        </div>
      )
    },
    {
      key: 'ticker.lastPrice',
      header: <>Price <SortIcon field="ticker.lastPrice" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <LivePrice value={r.ticker?.lastPrice ?? null} format={(v) => `$${v.toFixed(2)}`} />
    },
    {
      key: 'ticker.lastChangePct',
      header: <>Change % <SortIcon field="ticker.lastChangePct" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = r.ticker?.lastChangePct ?? null;
        return (
          <span className={`text-sm font-semibold tabular-nums ${pct == null ? 'text-gray-400' : pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '-'}
          </span>
        );
      }
    },
    {
      key: 'ticker.lastMarketCap',
      header: <>Market Cap <SortIcon field="ticker.lastMarketCap" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-gray-700 dark:text-gray-200">{r.ticker?.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '-'}</span>
    },
    {
      key: 'ticker.lastMarketCapDiff',
      header: <>MCap Δ <SortIcon field="ticker.lastMarketCapDiff" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const d = r.ticker?.marketCapDiff ?? null;
        return (
          <span className={`text-sm tabular-nums ${d == null ? 'text-gray-400' : d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {d != null ? formatMarketCapDiff(d) : '-'}
          </span>
        );
      }
    },
    {
      key: 'overallScore',
      header: <>Overall <SortIcon field="overallScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.overallScore} bold />
    },
    {
      key: 'valuationScore',
      header: <>Value <SortIcon field="valuationScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.valuationScore} />
    },
    {
      key: 'growthScore',
      header: <>Growth <SortIcon field="growthScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.growthScore} />
    },
    {
      key: 'profitabilityScore',
      header: <>Profit. <SortIcon field="profitabilityScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.profitabilityScore} />
    },
    {
      key: 'healthScore',
      header: <>Health <SortIcon field="healthScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.healthScore} />
    },
    {
      key: 'qualityScore',
      header: <>Quality <SortIcon field="qualityScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.qualityScore} />
    },
    {
      key: 'moatScore',
      header: <>Moat <SortIcon field="moatScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.moatScore ?? null} />
    },
    {
      key: 'altmanZ',
      header: <>Altman Z <SortIcon field="altmanZ" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const z = altmanZLabel(r.altmanZ);
        return <span className={z.color}>{r.altmanZ !== null ? r.altmanZ.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'piotroskiScore',
      header: <>Piotroski <SortIcon field="piotroskiScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const p = piotroskiLabel(r.piotroskiScore);
        return <span className={p.color}>{r.piotroskiScore !== null ? `${r.piotroskiScore}/9` : '-'}</span>;
      },
    },
    {
      key: 'beneishScore',
      header: <>Beneish M <SortIcon field="beneishScore" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const b = beneishLabel(r.beneishScore);
        return <span className={b.color}>{r.beneishScore !== null ? r.beneishScore.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'fcfMargin',
      header: <>FCF Margin <SortIcon field="fcfMargin" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const f = fcfMarginLabel(r.fcfMargin);
        return <span className={f.color}>{r.fcfMargin !== null ? `${(r.fcfMargin * 100).toFixed(1)}%` : '-'}</span>;
      },
    },
    {
      key: 'fcfConversion',
      header: <>FCF Conv. <SortIcon field="fcfConversion" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.fcfConversion;
        const color = v == null ? 'text-gray-400' : v >= 0.9 ? 'text-green-600 dark:text-green-400' : v >= 0.5 ? 'text-gray-700 dark:text-gray-200' : 'text-red-600 dark:text-red-400';
        return <span className={`text-sm tabular-nums ${color}`} title="Free cash flow ÷ net income — >100% means cash exceeds reported profit">{v != null ? `${(v * 100).toFixed(0)}%` : '-'}</span>;
      },
    },
    {
      key: 'debtRepaymentYears',
      header: <>Debt Repay <SortIcon field="debtRepaymentYears" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const d = debtRepayLabel(r.debtRepaymentYears);
        return (
          <span className={`text-sm tabular-nums ${d.color}`} title={`Years to repay net debt from FCF — ${d.label}`}>
            {r.debtRepaymentYears !== null ? `${r.debtRepaymentYears.toFixed(1)}y` : '-'}
          </span>
        );
      },
    },
    {
      key: 'revenueCagr',
      header: <>Rev CAGR <SortIcon field="revenueCagr" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year revenue CAGR">{r.revenueCagr !== null ? `${r.revenueCagr > 0 ? '+' : ''}${r.revenueCagr.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'netIncomeCagr',
      header: <>NI CAGR <SortIcon field="netIncomeCagr" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year net income CAGR">{r.netIncomeCagr !== null ? `${r.netIncomeCagr > 0 ? '+' : ''}${r.netIncomeCagr.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'epsCagr5y',
      header: <>EPS CAGR <SortIcon field="epsCagr5y" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year diluted EPS CAGR">{r.epsCagr5y != null ? `${r.epsCagr5y > 0 ? '+' : ''}${r.epsCagr5y.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'roic',
      header: <>ROIC <SortIcon field="roic" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="Return on Invested Capital (TTM NOPAT ÷ invested capital)">{r.roic != null ? `${r.roic.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'priceToCash',
      header: <>P/Cash <SortIcon field="priceToCash" /></>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="Market cap ÷ cash & short-term investments">{r.priceToCash != null ? `${r.priceToCash.toFixed(1)}×` : '-'}</span>,
    },
    {
      key: 'rsi14',
      header: <>RSI 14 <SortIcon field="rsi14" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.rsi14;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v <= 30 ? 'text-green-600 dark:text-green-400 font-semibold' : v >= 70 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title="14-day Wilder RSI (<30 oversold, >70 overbought)">{v.toFixed(0)}</span>;
      },
    },
    ...([
      ['sma20Pct', 'SMA 20', 'Price distance from 20-day simple moving average'],
      ['sma50Pct', 'SMA 50', 'Price distance from 50-day simple moving average'],
      ['sma200Pct', 'SMA 200', 'Price distance from 200-day simple moving average'],
      ['perf1m', 'Perf 1M', '1-month (21 trading days) price return'],
      ['perf3m', 'Perf 3M', '3-month (63 trading days) price return'],
      ['perf6m', 'Perf 6M', '6-month (126 trading days) price return'],
      ['perfYtd', 'Perf YTD', 'Year-to-date price return'],
      ['perf1y', 'Perf 1Y', '1-year (252 trading days) price return'],
    ] as const).map(([key, hdr, tip]) => ({
      key,
      header: <>{hdr} <SortIcon field={key} /></>,
      align: 'right' as const,
      sortable: true,
      render: (r: ScreenerResult) => {
        const v = (r as any)[key] as number | null | undefined;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title={tip}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
      },
    })),
    {
      key: 'ticker.latestMoversRVOL',
      header: <>RVOL <SortIcon field="ticker.latestMoversRVOL" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.ticker?.latestMoversRVOL;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v >= 1.5 ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title="Relative volume vs 20-day average">{v.toFixed(2)}×</span>;
      },
    },
    {
      key: 'ticker.stdDevReturn20d',
      header: <>Vol 20D <SortIcon field="ticker.stdDevReturn20d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.ticker?.stdDevReturn20d;
        return v != null ? <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="20-day daily return standard deviation">{v.toFixed(2)}%</span> : <span className="text-gray-400">-</span>;
      },
    },
    {
      key: 'marginStability',
      header: <>Margin σ <SortIcon field="marginStability" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.marginStability;
        if (v === null) return <span className="text-gray-400">-</span>;
        const color = v < 0.05 ? 'text-green-600 dark:text-green-400' : v < 0.15 ? 'text-gray-700 dark:text-gray-200' : 'text-red-600 dark:text-red-400';
        return <span className={`text-sm tabular-nums ${color}`} title="Standard deviation (σ) of annual operating margins — lower means more consistent">{(v * 100).toFixed(1)}%</span>;
      },
    },
    {
      key: 'pePercentile',
      header: <>P/E %ile <SortIcon field="pePercentile" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.pePercentile;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v <= 30 ? 'text-green-600 dark:text-green-400' : v >= 70 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title="Current P/E percentile vs own valuation history (0 = cheapest day on record, 100 = most expensive)">{Math.round(v)}ᵗʰ</span>;
      },
    },
    {
      key: 'peVsMedian3yPct',
      header: <>P/E vs 3Y Med <SortIcon field="peVsMedian3yPct" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.peVsMedian3yPct;
        if (v == null) return <span className="text-gray-400">-</span>;
        return <span className={`text-sm tabular-nums ${v < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} title="Current P/E vs trailing 3-year median P/E — negative = trading below its own 3Y median">{v > 0 ? '+' : ''}{v.toFixed(0)}%</span>;
      },
    },
    {
      // Backtested combo: rev/share +30% (1Y) AND EPS growth AND price ≥80%
      // of 52w high. Server-computed per row from DailyValuationHistory.
      key: 'trendSignal',
      header: 'Fund. Trend',
      align: 'center',
      sortable: false,
      render: (r) => {
        const ts = r.trendSignal;
        if (!ts || !ts.qualified) return <span className="text-gray-400">-</span>;
        const tip = [
          ts.revG1y != null ? `Rev/sh ${(ts.revG1y * 100).toFixed(0)}% (1Y)` : null,
          ts.epsG1y != null ? `EPS ${(ts.epsG1y * 100).toFixed(0)}%` : null,
          ts.pctOfHigh != null ? `${(ts.pctOfHigh * 100).toFixed(0)}% of 52w high` : null,
        ].filter(Boolean).join(' · ');
        return (
          <span title={`Fundamentals confirm trend — ${tip}`}
            className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap font-semibold">
            ✓ Trend
          </span>
        );
      },
    },
    {
      // Which strategy quick-screens this row currently satisfies — the
      // "what kind of stock is it" discovery loop, computed client-side via
      // the same matchesPreset() the analysis-page badges use (null-safe:
      // missing data never matches a bound).
      key: 'screens',
      header: 'Screens',
      align: 'left',
      sortable: false,
      render: (r) => {
        const m = matchedScreensFor(r);
        if (m.length === 0) return <span className="text-gray-400">-</span>;
        const shown = m.slice(0, 2);
        const rest = m.length - shown.length;
        return (
          <div className="flex flex-wrap gap-1 max-w-44" title={m.map((s) => s.label).join(' · ')}>
            {shown.map((s) => (
              <span key={s.label} className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap">
                {s.label.replace(/\s*\(.*\)\s*$/, '')}
              </span>
            ))}
            {rest > 0 && <span className="text-[10px] text-gray-400 self-center">+{rest}</span>}
          </div>
        );
      },
    },
    // FinnhubMetrics columns — sortable via `metrics.<field>` (server-side
    // orderBy on the finnhubMetrics relation). fmt varies per metric.
    ...METRIC_FILTERS.map((def) => ({
      key: `metrics.${def.key}`,
      header: <>{def.label.replace(/ %$/, '')} <SortIcon field={`metrics.${def.key}`} /></>,
      align: 'right' as const,
      sortable: true,
      render: (r: ScreenerResult) => {
        const v = r.metrics?.[def.key];
        if (v == null) return <span className="text-gray-400">-</span>;
        const isPct = def.label.endsWith('%');
        const text = isPct
          ? `${v.toFixed(1)}%`
          : def.key === 'beta' || def.key === 'pegRatio' || def.key === 'currentRatio'
            ? v.toFixed(2)
            : v.toFixed(1);
        return <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">{text}</span>;
      },
    })),
    {
      key: 'insider.netBuyValue90d',
      header: <>Insider 90D <SortIcon field="insider.netBuyValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.insiderNetBuyValue90d;
        if (v == null) return <span className="text-gray-400">-</span>;
        const pct = r.insiderNetBuyPct90d;
        return (
          <span
            className={`text-sm tabular-nums ${v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}
            title={pct != null ? `Net open-market insider buying, 90D: ${formatCurrencyCompact(v, true)} (${(pct * 100).toFixed(3)}% of shares outstanding)` : `Net open-market insider buying, 90D: ${formatCurrencyCompact(v, true)}`}
          >
            {formatCurrencyCompact(v, true)}
          </span>
        );
      },
    },
    {
      key: 'insider.largestBuyValue90d',
      header: <>Top Buy <SortIcon field="insider.largestBuyValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestBuyValue90d != null
        ? <span className="text-sm tabular-nums text-green-600 dark:text-green-400" title="Largest single open-market insider purchase, 90D">{formatCurrencyCompact(r.insiderLargestBuyValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.largestSellValue90d',
      header: <>Top Sell <SortIcon field="insider.largestSellValue90d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestSellValue90d != null
        ? <span className="text-sm tabular-nums text-red-600 dark:text-red-400" title="Largest single open-market insider sale, 90D">{formatCurrencyCompact(r.insiderLargestSellValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.uniqueSellers14d',
      header: <>Cluster 14D <SortIcon field="insider.uniqueSellers14d" /></>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const b = r.insiderUniqueBuyers14d;
        const s = r.insiderUniqueSellers14d;
        if (b == null && s == null) return <span className="text-gray-400">-</span>;
        if (!b && !s) return <span className="text-gray-400">-</span>;
        return (
          <span className="text-sm tabular-nums" title="Distinct insiders trading open-market in the last 14 days">
            {b ? <span className="text-green-600 dark:text-green-400">{b}B</span> : null}
            {b && s ? <span className="text-gray-400">·</span> : null}
            {s ? <span className="text-red-600 dark:text-red-400">{s}S</span> : null}
          </span>
        );
      },
    },
  ], [sortField, sortOrder]);

  // ── Column view tabs — persist the last used view (localStorage + a
  // shareable ?view= param on the standalone /screener page). ────────────
  const [columnView, setColumnView] = useState<ColumnViewId>('overview');
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [showColPicker, setShowColPicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const advancedActive = ADVANCED_FILTERS.some((d) => d.active(advanced[d.key]));
  const advancedVisible = showAdvanced || advancedActive;
  // Metric filters use DualRangeSlider (min+max) — active when any Finnhub,
  // insider, market or analysis key has a range.
  const METRIC_KEY_SET = new Set<string>([...MARKET_RANGE_FILTERS, ...METRIC_FILTERS, ...INSIDER_RANGE_FILTERS, ...ANALYSIS_RANGE_FILTERS].map(d => d.key));
  const [showMetrics, setShowMetrics] = useState(false);
  const metricsActiveCount = Object.keys(metricRanges).filter(k => METRIC_KEY_SET.has(k)).length;
  const metricsActive = metricsActiveCount > 0;
  const metricsVisible = showMetrics || metricsActive;
  // Score sliders collapse behind an accordion too — the panel opens at two
  // control rows instead of a wall of sliders.
  const [showScores, setShowScores] = useState(false);
  const scoreActiveCount = Object.keys(scoreRanges).length;
  const scoresVisible = showScores || scoreActiveCount > 0;
  // Shared wiring for registry-driven range sliders — a handle returned to
  // the bound's default deletes that side of the range (default = no filter).
  const rangeSliderProps = (def: { key: RangeFilterKey; min: number; max: number }) => {
    const r = metricRanges[def.key];
    const apply = (side: 'min' | 'max', v: number) => {
      const next: { min?: number; max?: number } = { ...r };
      if (side === 'min') { if (v === def.min) delete next.min; else next.min = v; }
      else { if (v === def.max) delete next.max; else next.max = v; }
      setMetricRange(def.key, next.min === undefined && next.max === undefined ? undefined : next);
    };
    return {
      valueMin: r?.min ?? def.min,
      valueMax: r?.max ?? def.max,
      onChangeMin: (v: number) => apply('min', v),
      onChangeMax: (v: number) => apply('max', v),
    };
  };
  // Same sparse-range semantics for score filters: touching a bound creates
  // the entry, returning it to the 0–100 default deletes it.
  const scoreSliderProps = (def: (typeof SCORE_FILTERS)[number]) => {
    const r = scoreRanges[def.key];
    const apply = (side: 'min' | 'max', v: number) => {
      const next: { min?: number; max?: number } = { ...r };
      if (side === 'min') { if (v === 0) delete next.min; else next.min = v; }
      else { if (v === 100) delete next.max; else next.max = v; }
      setScoreRange(def.key, next);
    };
    return {
      valueMin: r?.min ?? 0,
      valueMax: r?.max ?? 100,
      onChangeMin: (v: number) => apply('min', v),
      onChangeMax: (v: number) => apply('max', v),
    };
  };
  /** Which strategy quick-screens does this row satisfy right now? */
  const matchedScreensFor = (r: ScreenerResult) =>
    QUICK_SCREENS.filter((q) => q.group !== 'score' && matchesPreset(q.preset, {
      scores: r,
      metrics: r.metrics,
      market: { price: r.ticker?.lastPrice ?? null, changePct: r.ticker?.lastChangePct ?? null, marketCapB: r.ticker?.lastMarketCap ?? null, employees: r.ticker?.employees ?? null, rvol: r.ticker?.latestMoversRVOL ?? null, volatility20d: r.ticker?.stdDevReturn20d ?? null },
      insider: { netBuyValue90d: r.insiderNetBuyValue90d, netBuyPct90d: r.insiderNetBuyPct90d },
      trendSignal: r.trendSignal ?? null,
    }));
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const fromUrl = sp.get('view') as ColumnViewId | null;
    const fromStore = localStorage.getItem('screener-column-view') as ColumnViewId | null;
    const initial = fromUrl ?? fromStore;
    if (initial && COLUMN_VIEWS.some(v => v.id === initial)) setColumnView(initial);
    // Custom column set — URL ?cols= wins over localStorage (shareable link).
    const colsParam = sp.get('cols');
    const stored = localStorage.getItem('screener-custom-cols');
    try {
      if (colsParam) setCustomCols(colsParam.split(',').map((s) => s.trim()).filter(Boolean));
      else if (stored) setCustomCols(JSON.parse(stored) as string[]);
    } catch { /* ignore malformed stored state */ }
  }, []);
  useEffect(() => {
    localStorage.setItem('screener-column-view', columnView);
    if (window.location.pathname !== '/screener') return;
    const sp = new URLSearchParams(window.location.search);
    if (columnView === 'overview') sp.delete('view'); else sp.set('view', columnView);
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [columnView]);
  // Persist the custom column set (localStorage always; ?cols= in the URL
  // only while the Custom view is active so shared links carry the config).
  useEffect(() => {
    if (customCols.length > 0) localStorage.setItem('screener-custom-cols', JSON.stringify(customCols));
    if (window.location.pathname !== '/screener') return;
    const sp = new URLSearchParams(window.location.search);
    if (columnView === 'custom' && customCols.length > 0) sp.set('cols', customCols.join(','));
    else sp.delete('cols');
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [customCols, columnView]);

  const columnMap = useMemo(() => new Map(allColumns.map(c => [c.key, c])), [allColumns]);
  // Column picker actions — every edit switches the active tab to Custom.
  // effectiveCols: the user's custom set, or the current view's keys as the
  // seed before the first edit.
  const effectiveCols = useMemo<string[]>(() => {
    if (customCols.length > 0) return customCols;
    const view = COLUMN_VIEWS.find(v => v.id === columnView);
    return [...(view?.keys ?? allColumns.map(c => c.key))];
  }, [customCols, columnView, allColumns]);
  const columns = useMemo(() => {
    if (columnView === 'custom') {
      // User-defined order — unknown keys (renamed/removed columns) drop out,
      // Company is force-pinned first if the user somehow removed it.
      const keys = effectiveCols.filter((k) => columnMap.has(k));
      const withPin = keys.includes(PINNED_COLUMN) ? keys : [PINNED_COLUMN, ...keys];
      const resolved = withPin.map((k) => columnMap.get(k)!).filter(Boolean);
      return resolved.length > 0 ? resolved : allColumns;
    }
    const view = COLUMN_VIEWS.find(v => v.id === columnView);
    if (!view || view.keys === null) return allColumns;
    return (view.keys as readonly string[]).map(k => columnMap.get(k)).filter((c): c is ColumnDef<ScreenerResult> => !!c);
  }, [allColumns, columnMap, columnView, effectiveCols]);

  const applyCustomCols = (next: string[]) => {
    const deduped = [PINNED_COLUMN, ...next.filter((k) => k !== PINNED_COLUMN && columnMap.has(k))];
    setCustomCols(deduped);
    setColumnView('custom');
  };
  const toggleColumn = (key: string) => {
    if (key === PINNED_COLUMN) return;
    applyCustomCols(effectiveCols.includes(key) ? effectiveCols.filter((k) => k !== key) : [...effectiveCols, key]);
  };
  const moveColumn = (key: string, dir: -1 | 1) => {
    const i = effectiveCols.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= effectiveCols.length) return;
    const next = [...effectiveCols];
    [next[i], next[j]] = [next[j]!, next[i]!];
    applyCustomCols(next);
  };

  const totalPages = pagination?.totalPages || 1;
  const total = pagination?.total || 0;
  // The dropdown mirrors active preset state (first exact preset match wins).
  const activePresetIdx = PRESET_OPTIONS.findIndex((s) => isPresetActive(s.preset));

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Filters</span>
          <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Reset
            </button>
          )}
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-200 dark:border-gray-600 border-t-blue-500" />
          )}
        </div>

        {/* Quick screens — all one-tap preset combinations in a single
            grouped dropdown (previously 30+ pills across five rows). The
            active preset stays selected while the filter state matches;
            verdict presets live in the VerdictMatrix grid instead. */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider w-16 sm:w-20 shrink-0">Screens:</span>
          <select
            value={activePresetIdx >= 0 ? String(activePresetIdx) : ''}
            onChange={(e) => {
              if (e.target.value === '') return;
              const s = PRESET_OPTIONS[Number(e.target.value)];
              if (s) applyPreset(s.preset);
            }}
            className="h-8 max-w-64 w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
          >
            <option value="">Quick screens…</option>
            {PRESET_GROUPS.filter((g) => g.id !== 'verdict').map((g) => (
              <optgroup key={g.id} label={g.label}>
                {PRESET_OPTIONS.map((s, i) => (s.group === g.id ? <option key={s.label} value={i}>{s.label}</option> : null))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Saved screens — authenticated users persist up to 3 filter sets.
            Params serialize identically to the share URL. */}
        {savedScreens.isAuthenticated && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1 w-20 shrink-0">Saved:</span>
            {savedScreens.screens.map((s) => (
              <span key={s.id} className="inline-flex items-center rounded-full border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 overflow-hidden">
                <button
                  onClick={() => restoreFromParams(new URLSearchParams(s.params))}
                  title={s.params}
                  className="text-[11px] px-2.5 py-1 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  {s.name}
                </button>
                <button
                  onClick={() => savedScreens.deleteScreen(s.id)}
                  title="Delete saved screen"
                  className="text-[11px] px-1.5 py-1 text-emerald-500/70 hover:text-red-500 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
            {showSaveInput ? (
              <span className="inline-flex items-center gap-1">
                <input
                  autoFocus
                  value={screenName}
                  onChange={(e) => setScreenName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && screenName.trim()) {
                      if (await savedScreens.saveScreen(screenName.trim(), buildParamsString())) {
                        setScreenName(''); setShowSaveInput(false);
                      }
                    } else if (e.key === 'Escape') { setShowSaveInput(false); }
                  }}
                  placeholder="Screen name…"
                  maxLength={40}
                  className="h-6 w-32 px-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-[11px] text-gray-700 dark:text-gray-300 outline-none focus:border-blue-400"
                />
                <button
                  onClick={async () => {
                    if (screenName.trim() && await savedScreens.saveScreen(screenName.trim(), buildParamsString())) {
                      setScreenName(''); setShowSaveInput(false);
                    }
                  }}
                  disabled={savedScreens.loading || !screenName.trim()}
                  className="text-[11px] px-2 py-1 rounded-md bg-blue-600 text-white disabled:opacity-40"
                >
                  Save
                </button>
                <button onClick={() => setShowSaveInput(false)} className="text-[11px] text-gray-400 hover:text-gray-600">×</button>
              </span>
            ) : savedScreens.canSave ? (
              <button
                onClick={() => setShowSaveInput(true)}
                disabled={!hasActiveFilters}
                title={hasActiveFilters ? `Save current filters (${savedScreens.screens.length}/${MAX_SAVED_SCREENS})` : 'Set some filters first'}
                className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Save current ({savedScreens.screens.length}/{MAX_SAVED_SCREENS})
              </button>
            ) : (
              <span className="text-[11px] text-gray-400">max {MAX_SAVED_SCREENS} saved</span>
            )}
            {savedScreens.error && <span className="text-[11px] text-red-500">{savedScreens.error}</span>}
          </div>
        )}

        {/* PMP Verdict matrix — 4×4 fund×val grid; cell = exact verdictKey
            (with live ticker counts), row/col headers = the atomic
            fund/val axes, plus the out-of-grid 'insufficient' state. */}
        <VerdictMatrix verdictFilters={verdictFilters} setVerdictFilter={setVerdictFilter} />

        {/* Universe & market controls — a single compact row; everything
            heavier lives behind the accordions below. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-3">
          <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">Search</label>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ticker or company…"
                className="w-full h-8 pl-8 pr-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">Sort By</label>
            <select
              value={`${sortField}:${sortOrder}`}
              onChange={(e) => {
                const parts = e.target.value.split(':');
                const f = parts[0] ?? 'healthScore';
                const o = (parts[1] === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
                setSort(f, o);
              }}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">Sector</label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Sectors</option>
              {SECTORS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">Industry</label>
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              <option value="">All Industries</option>
              {industries.map((ind) => (
                <option key={ind} value={ind}>{ind}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">Market Cap</label>
            <select
              value={marketCapPreset}
              onChange={(e) => setMarketCapPreset(e.target.value)}
              className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all cursor-pointer"
            >
              {MARKET_CAP_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Collapsible filter groups — the panel opens at two compact rows;
            each group auto-opens while any of its filters is active. */}
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setShowScores(v => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            aria-expanded={scoresVisible}
          >
            {scoresVisible ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Score filters
            {scoreActiveCount > 0 && <span className="text-blue-500 font-semibold">({scoreActiveCount} active)</span>}
          </button>
          <button
            type="button"
            onClick={() => setShowMetrics(v => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            aria-expanded={metricsVisible}
          >
            {metricsVisible ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Metric filters
            {metricsActive && <span className="text-blue-500 font-semibold">({metricsActiveCount} active)</span>}
          </button>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            aria-expanded={advancedVisible}
          >
            {advancedVisible ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Advanced filters
            {advancedActive && <span className="text-blue-500 font-semibold">(active)</span>}
          </button>
        </div>
        {scoresVisible && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">PMP Scores</span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">our composite ratings, 0–100</span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-3 gap-y-2">
              {SCORE_FILTERS.map((d) => (
                <DualRangeSlider
                  key={d.key}
                  label={d.label}
                  min={0} max={100}
                  {...scoreSliderProps(d)}
                  accentColor={d.accent}
                />
              ))}
            </div>
          </div>
        )}
        {metricsVisible && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
            {/* Grouped by category — 20 sliders flat was unscannable. */}
            {SLIDER_GROUPS.map((group) => {
              const defs = SLIDER_DEFS.filter((d) => d.group === group);
              const activeInGroup = defs.filter((d) => metricRanges[d.key]).length;
              return (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{group}</span>
                    {activeInGroup > 0 && <span className="text-[10px] text-blue-500 font-medium">{activeInGroup} active</span>}
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2">
                    {defs.map((def) => (
                      <div key={def.key} className={metricRanges[def.key] ? 'rounded-md ring-1 ring-blue-400/60 bg-blue-50/50 dark:bg-blue-950/20 -m-0.5 p-0.5' : ''}>
                        <DualRangeSlider
                          label={def.label}
                          hint={'hint' in def ? def.hint : undefined}
                          min={def.min} max={def.max} step={def.step}
                          {...rangeSliderProps(def)}
                          accentColor="sky"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="col-span-full flex items-center justify-between">
              <span className="text-[10px] text-gray-400">Metrics from Finnhub fundamentals + our own analysis history (coverage ~70–99 % per field; filtered-out tickers without data are excluded).</span>
              {metricsActive && (
                <button
                  onClick={() => { for (const def of [...MARKET_RANGE_FILTERS, ...METRIC_FILTERS, ...INSIDER_RANGE_FILTERS, ...ANALYSIS_RANGE_FILTERS]) setMetricRange(def.key as RangeFilterKey, undefined); }}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear metric filters
                </button>
              )}
            </div>
          </div>
        )}
        {advancedVisible && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-2 mt-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          {ADVANCED_FILTERS.map((d) => {
            const raw = advanced[d.key];
            const shown = d.active(raw)
              ? String(Math.round(raw * d.displayScale * 100) / 100)
              : '';
            return (
              <div key={d.key} className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-gray-600 dark:text-gray-400 tracking-wide">{d.label}</label>
                <input
                  type="number"
                  step={d.key === 'minPiotroski' ? 1 : 'any'}
                  value={shown}
                  onChange={(e) => {
                    let v = parseFloat(e.target.value);
                    if (!Number.isFinite(v)) v = d.def;
                    else v = v / d.displayScale;
                    if (d.key === 'minPiotroski') v = Math.min(9, Math.max(0, Math.round(v)));
                    setAdvancedValue(d.key, v);
                  }}
                  placeholder="—"
                  className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none transition-all"
                />
                <span className="text-[10px] text-gray-400">{d.hint}</span>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* Active filter chips — every constraint as a removable chip, built
          from the same registries that own the filters (a new filter shows
          up here automatically). */}
      {(() => {
        const chips: { id: string; label: string; clear: () => void }[] = [];
        const fmtBound = (r: { min?: number; max?: number } | undefined, lo: number, hi: number) => {
          const a = r?.min !== undefined && r.min !== lo ? `≥${r.min}` : '';
          const b = r?.max !== undefined && r.max !== hi ? `≤${r.max}` : '';
          return [a, b].filter(Boolean).join(' ');
        };
        for (const d of SCORE_FILTERS) {
          const bounds = fmtBound(scoreRanges[d.key], 0, 100);
          if (bounds) chips.push({ id: `s:${d.key}`, label: `${d.label} ${bounds}`, clear: () => setScoreRange(d.key, undefined) });
        }
        for (const d of RANGE_FILTERS) {
          const r = metricRanges[d.key];
          if (!r) continue;
          const bounds = fmtBound(r, d.min, d.max);
          if (bounds) chips.push({ id: `m:${d.key}`, label: `${d.label} ${bounds}`, clear: () => setMetricRange(d.key, undefined) });
        }
        for (const d of ADVANCED_FILTERS) {
          const v = advanced[d.key];
          if (d.active(v)) chips.push({ id: `a:${d.key}`, label: `${d.label.replace(/ %\)$/, ')')}: ${Math.round(v * d.displayScale * 100) / 100}`, clear: () => setAdvancedValue(d.key, d.def) });
        }
        if (selectedSector) chips.push({ id: 'sector', label: `Sector: ${selectedSector}`, clear: () => setSelectedSector('') });
        if (selectedIndustry) chips.push({ id: 'industry', label: `Industry: ${selectedIndustry}`, clear: () => setSelectedIndustry('') });
        if (searchQuery) chips.push({ id: 'q', label: `“${searchQuery}”`, clear: () => setSearchQuery('') });
        if (marketCapPreset !== 'all') {
          const p = MARKET_CAP_PRESETS.find((x) => x.id === marketCapPreset);
          if (p) chips.push({ id: 'mcap', label: `Cap: ${p.label}`, clear: () => setMarketCapPreset('all') });
        }
        if (trendConfirmed) {
          chips.push({ id: 'trend', label: 'Trend × Fundamentals', clear: () => setTrendConfirmed(false) });
        }
        for (const d of VERDICT_FILTERS) {
          const v = verdictFilters[d.key];
          if (v) {
            const o = d.options.find((x) => x.value === v);
            chips.push({ id: `v:${d.key}`, label: `${d.label}: ${o?.label ?? v}`, clear: () => setVerdictFilter(d.key, undefined) });
          }
        }
        if (chips.length === 0) return null;
        return (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            {chips.map((c) => (
              <span key={c.id} className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-[10px] text-blue-700 dark:text-blue-300 overflow-hidden">
                <span className="pl-2 pr-1 py-0.5">{c.label}</span>
                <button onClick={c.clear} className="px-1.5 py-0.5 hover:text-red-500" title="Clear filter">×</button>
              </span>
            ))}
            <button onClick={resetFilters} className="text-[10px] text-gray-400 hover:text-red-500 underline underline-offset-2">Clear all</button>
          </div>
        );
      })()}

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? 'Searching...' : `${total} result${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Results Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Column view tabs — switch metric columns without touching filters.
            flex-wrap so all view tabs and ⚙ Columns stay visible without clipping on 360px mobile. */}
        <div className="flex flex-wrap items-center gap-1 px-3 pt-2.5 pb-1 border-b border-gray-100 dark:border-slate-700" role="tablist" aria-label="Column views">
          {COLUMN_VIEWS.map(v => (
            <button
              key={v.id}
              role="tab"
              aria-selected={columnView === v.id}
              onClick={() => setColumnView(v.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
                columnView === v.id
                  ? 'text-blue-600 dark:text-blue-400 border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
                  : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {v.label}
            </button>
          ))}
          <button
            onClick={() => setShowColPicker(v => !v)}
            title="Customize columns (pick + reorder)"
            aria-expanded={showColPicker}
            className={`ml-auto px-2.5 py-1.5 text-xs rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
              showColPicker
                ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            ⚙ Columns
          </button>
        </div>
        {showColPicker && (
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-900/40">
            {/* Shown columns — ordered chips, ← → reorder, × remove */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-14 shrink-0">Shown:</span>
              {effectiveCols.filter((k) => columnMap.has(k)).map((k, i) => {
                const pinned = k === PINNED_COLUMN;
                return (
                  <span key={k} className="inline-flex items-center gap-0.5 rounded-full border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-[11px] pl-2 pr-0.5 py-0.5">
                    <span className="text-gray-700 dark:text-gray-200">{columnLabel(k)}</span>
                    {!pinned && (
                      <>
                        <button onClick={() => moveColumn(k, -1)} disabled={i <= 1} className="px-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20" title="Move left">←</button>
                        <button onClick={() => moveColumn(k, 1)} disabled={i >= effectiveCols.length - 1} className="px-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20" title="Move right">→</button>
                        <button onClick={() => toggleColumn(k)} className="px-1 text-gray-400 hover:text-red-500" title="Remove">×</button>
                      </>
                    )}
                    {pinned && <span className="pr-1.5 text-[9px] text-gray-300 dark:text-gray-600">pinned</span>}
                  </span>
                );
              })}
            </div>
            {/* Available columns — click to append */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-14 shrink-0">Add:</span>
              {allColumns
                .filter((c) => !effectiveCols.includes(c.key) && c.key !== PINNED_COLUMN)
                .map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleColumn(c.key)}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    + {columnLabel(c.key)}
                  </button>
                ))}
            </div>
          </div>
        )}
        <UniversalTable
          data={results}
          columns={columns}
          keyExtractor={(r) => r.symbol}
          isLoading={loading}
          emptyMessage="No companies match the selected filters."
          sortKey={sortField as any}
          ascending={sortOrder === 'asc'}
          onSort={(key) => handleSort(key as string)}
          onRowClick={(r) => handleTickerClick(r.symbol)}
          stickyFirst
          renderMobileCard={(r) => {
            const chg = r.ticker?.lastChangePct ?? null;
            return (
              <div
                onClick={() => handleTickerClick(r.symbol)}
                className="bg-white dark:bg-gray-800 p-3.5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-2.5">
                  <CompanyLogo ticker={r.symbol} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-gray-900 dark:text-white">{r.symbol}</span>
                      {r.trendSignal?.qualified && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                          ✓ Trend
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{r.ticker?.name || r.symbol}</div>
                  </div>
                  <Sparkline data={r.sparkline} width={52} height={20} />
                  <div className="text-right tabular-nums shrink-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                      {r.ticker?.lastPrice ? `$${r.ticker.lastPrice.toFixed(2)}` : '-'}
                    </div>
                    {chg != null && (
                      <div className={`text-[11px] font-semibold ${chg >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center bg-gray-50/70 dark:bg-gray-900/40 rounded-lg py-1.5 px-1">
                  {([
                    ['All', r.overallScore],
                    ['Val', r.valuationScore],
                    ['Grw', r.growthScore],
                    ['Prof', r.profitabilityScore],
                    ['Hlt', r.healthScore],
                    ['Qual', r.qualityScore],
                    ['Moat', r.moatScore],
                  ] as [string, number | null][]).map(([lbl, v]) => (
                    <div key={lbl}>
                      <div className="text-[9px] text-gray-400 uppercase">{lbl}</div>
                      <div className={`font-bold text-xs tabular-nums ${scoreColor(v)}`}>{v !== null ? v.toFixed(0) : '-'}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span className="truncate">{r.ticker?.sector || '-'}</span>
                  <span className="font-mono tabular-nums">{r.ticker?.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '-'}</span>
                </div>
              </div>
            );
          }}
        />

        {/* Mobile: the cards are the browse view, while the active column view
            stays reachable behind this disclosure as a horizontally scrollable table. */}
        <div className="lg:hidden border-t border-gray-100 dark:border-slate-700">
          <details className="group">
            <summary className="flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span>Show table view ({columns.length} columns)</span>
              <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-2 pb-3">
              <UniversalTable
                data={results}
                columns={columns}
                keyExtractor={(r) => r.symbol}
                isLoading={loading}
                emptyMessage="No companies match the selected filters."
                sortKey={sortField as any}
                ascending={sortOrder === 'asc'}
                onSort={(key) => handleSort(key as string)}
                onRowClick={(r) => handleTickerClick(r.symbol)}
                forceTable
                stickyFirst
              />
            </div>
          </details>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
