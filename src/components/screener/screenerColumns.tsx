'use client';

import React from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import CompanyLogo from '@/components/CompanyLogo';
import type { ColumnDef } from '@/components/UniversalTable';
import { LivePrice } from '@/components/LivePrice';
import { Sparkline } from '@/components/Sparkline';
import { formatBillions, formatMarketCapDiff, formatCurrencyCompact } from '@/lib/utils/format';
import {
  type ScreenerResult,
  type RangeFilterKey,
  scoreColor,
  altmanZLabel,
  piotroskiLabel,
  beneishLabel,
  fcfMarginLabel,
  debtRepayLabel,
  MARKET_RANGE_FILTERS,
  METRIC_FILTERS,
  ANALYSIS_RANGE_FILTERS,
  PE_MEDIAN_WINDOWS,
  QUICK_SCREENS,
  matchesPreset,
} from '@/lib/utils/screener';

// Column views — thematic subsets of the full column set. Every view opens
// with the same identity block (Company · 1Y · Price · Change% · MktCap) so a
// row is never bare numbers without market context; only the trailing columns
// change per theme. Filters/sort are view-independent — switching a tab never
// changes the dataset. Tab order runs general → specialised.
export const COLUMN_VIEWS = [
  { id: 'overview', label: 'Overview', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'overallScore', 'valuationScore', 'growthScore', 'profitabilityScore', 'healthScore', 'qualityScore', 'moatScore'] },
  { id: 'valuation', label: 'Valuation', keys: ['ticker.name', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'metrics.peRatio', 'metrics.forwardPe', 'metrics.pegRatio', 'metrics.psRatio', 'metrics.pbRatio', 'metrics.priceFreeCashFlow', 'priceToCash', 'pePercentile', 'peVsMedian3yPct'] },
  { id: 'metrics', label: 'Profit & Growth', keys: ['ticker.name', 'ticker.lastPrice', 'ticker.lastMarketCap', 'metrics.roe', 'roic', 'metrics.operatingMargin', 'metrics.netMargin', 'metrics.revenueGrowth', 'metrics.earningsGrowth', 'revenueCagr', 'epsCagr5y', 'fcfMargin'] },
  { id: 'technical', label: 'Technical', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'rsi14', 'sma20Pct', 'sma50Pct', 'sma200Pct', 'perf1m', 'perf3m', 'perfYtd', 'perf1y', 'metrics.week52Position', 'ticker.latestMoversRVOL'] },
  { id: 'risk', label: 'Risk & Balance', keys: ['ticker.name', 'ticker.lastPrice', 'ticker.lastMarketCap', 'altmanZ', 'piotroskiScore', 'beneishScore', 'metrics.currentRatio', 'metrics.debtEquityRatio', 'metrics.interestCoverage', 'debtRepaymentYears', 'marginStability', 'fcfConversion', 'metrics.beta'] },
  { id: 'market', label: 'Market & Div.', keys: ['ticker.name', 'ticker.sector', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'ticker.lastMarketCapDiff', 'metrics.dividendYield', 'metrics.payoutRatio', 'ticker.employees', 'analyst.buy', 'trendSignal', 'screens'] },
  { id: 'insiders', label: 'Insiders', keys: ['ticker.name', 'sparkline', 'ticker.lastPrice', 'ticker.lastChangePct', 'ticker.lastMarketCap', 'analyst.buy', 'insider.netBuyValue90d', 'insider.largestBuyValue90d', 'insider.largestSellValue90d', 'insider.uniqueSellers14d', 'overallScore'] },
  { id: 'all', label: 'All columns', keys: null },
  { id: 'custom', label: 'Custom', keys: null },
] as const;

export type ColumnViewId = (typeof COLUMN_VIEWS)[number]['id'];

/** Plain-text labels for the column picker (column headers contain icons). */
export const COLUMN_LABELS: Record<string, string> = {
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
  'peVsMedian1yPct': 'P/E vs 1Y Median',
  'peVsMedian3yPct': 'P/E vs 3Y Median',
  'peVsMedian5yPct': 'P/E vs 5Y Median',
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

export const columnLabel = (key: string) =>
  COLUMN_LABELS[key]
  ?? METRIC_FILTERS.find((d) => `metrics.${d.key}` === key)?.label
  ?? key;

/** All slider-rendered range defs (Finnhub metrics + our analysis metrics). */
export const SLIDER_DEFS: { key: RangeFilterKey; label: string; min: number; max: number; step: number; group: string; hint?: string }[] = [
  ...MARKET_RANGE_FILTERS,
  ...METRIC_FILTERS,
  ...ANALYSIS_RANGE_FILTERS,
];

export const SLIDER_BY_KEY = new Map(SLIDER_DEFS.map((d) => [d.key, d]));

/** Finviz-style filter drawer tabs — replaces the 1,000px vertical wall of sliders. */
export const FILTER_DRAWER_TABS = [
  {
    id: 'scores',
    label: 'Scores & Quality',
    keys: ['fcfConversion', 'marginStability'] as RangeFilterKey[],
    includesScores: true,
    includesAdvanced: true,
  },
  {
    id: 'valuation',
    label: 'Valuation',
    keys: ['peRatio', 'forwardPe', 'pegRatio', 'psRatio', 'pbRatio', 'priceFreeCashFlow', 'priceCashFlow', 'priceToCash', 'evEbitda', 'evSales', 'peVsMedian1yPct', 'peVsMedian3yPct', 'peVsMedian5yPct'] as RangeFilterKey[],
  },
  {
    id: 'profitability',
    label: 'Profit & Growth',
    keys: ['roe', 'roic', 'roa', 'grossMargin', 'operatingMargin', 'netMargin', 'assetTurnover', 'revenueGrowth', 'earningsGrowth', 'revenueCagr', 'netIncomeCagr', 'epsCagr5y', 'bookValueGrowth'] as RangeFilterKey[],
  },
  {
    id: 'technical',
    label: 'Technical & Perf.',
    keys: ['rsi14', 'sma20Pct', 'sma50Pct', 'sma200Pct', 'perf1m', 'perf3m', 'perf6m', 'perfYtd', 'perf1y', 'week52Position', 'rvol', 'volatility20d', 'beta', 'changePct', 'price'] as RangeFilterKey[],
  },
  {
    id: 'dividends',
    label: 'Dividends & Balance',
    keys: ['dividendYield', 'payoutRatio', 'currentRatio', 'quickRatio', 'debtEquityRatio', 'interestCoverage', 'employees'] as RangeFilterKey[],
  },
  {
    id: 'all',
    label: 'All Filters',
    keys: SLIDER_DEFS.map((d) => d.key),
    includesScores: true,
    includesAdvanced: true,
  },
] as const;

export type FilterTabId = (typeof FILTER_DRAWER_TABS)[number]['id'];

// Quick-screen presets rendered in the dropdown — verdict presets render in VerdictMatrix.
export const PRESET_OPTIONS = QUICK_SCREENS.filter((s) => s.group !== 'verdict');

// Company is the row identifier — always first, never removable.
export const PINNED_COLUMN = 'ticker.name';

const scoreBar = (v: number) =>
  v >= 70 ? 'bg-emerald-500' : v >= 50 ? 'bg-amber-400' : v >= 30 ? 'bg-orange-400' : 'bg-rose-500';

export const ScoreCell = ({ v, bold }: { v: number | null; bold?: boolean }) =>
  v == null ? <span className="text-gray-400">-</span> : (
    <span className="inline-flex flex-col items-end gap-0.5" title={`${v.toFixed(0)} / 100`}>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${scoreColor(v)}`}>{v.toFixed(0)}</span>
      <span className="h-1 w-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <span className={`block h-full rounded-full ${scoreBar(v)}`} style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </span>
    </span>
  );

export function SortIcon({
  field,
  sortField,
  sortOrder,
}: {
  field: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}) {
  if (sortField !== field) return <ChevronsUpDown size={12} className="inline ml-1 text-gray-300 dark:text-gray-600" />;
  return sortOrder === 'asc'
    ? <ChevronUp size={12} className="inline ml-1 text-blue-500" />
    : <ChevronDown size={12} className="inline ml-1 text-blue-500" />;
}

/** Which strategy quick-screens does this row satisfy right now? */
export const matchedScreensFor = (r: ScreenerResult) =>
  QUICK_SCREENS.filter((q) => q.group !== 'score' && matchesPreset(q.preset, {
    scores: r,
    metrics: r.metrics,
    market: {
      price: r.ticker?.lastPrice ?? null,
      changePct: r.ticker?.lastChangePct ?? null,
      marketCapB: r.ticker?.lastMarketCap ?? null,
      employees: r.ticker?.employees ?? null,
      rvol: r.ticker?.latestMoversRVOL ?? null,
      volatility20d: r.ticker?.stdDevReturn20d ?? null,
    },
    insider: { netBuyValue90d: r.insiderNetBuyValue90d, netBuyPct90d: r.insiderNetBuyPct90d },
    trendSignal: r.trendSignal ?? null,
  }));

const TECH_PERF_COLUMNS = [
  ['sma20Pct', 'SMA 20', 'Price distance from 20-day simple moving average'],
  ['sma50Pct', 'SMA 50', 'Price distance from 50-day simple moving average'],
  ['sma200Pct', 'SMA 200', 'Price distance from 200-day simple moving average'],
  ['perf1m', 'Perf 1M', '1-month (21 trading days) price return'],
  ['perf3m', 'Perf 3M', '3-month (63 trading days) price return'],
  ['perf6m', 'Perf 6M', '6-month (126 trading days) price return'],
  ['perfYtd', 'Perf YTD', 'Year-to-date price return'],
  ['perf1y', 'Perf 1Y', '1-year (252 trading days) price return'],
] as const;

export function buildScreenerColumns(sortField: string, sortOrder: 'asc' | 'desc'): ColumnDef<ScreenerResult>[] {
  const icon = (field: string) => <SortIcon field={field} sortField={sortField} sortOrder={sortOrder} />;

  return [
    {
      key: 'ticker.name',
      header: <>Company {icon('ticker.name')}</>,
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
      ),
    },
    {
      key: 'ticker.sector',
      header: <>Sector {icon('ticker.sector')}</>,
      align: 'left',
      sortable: true,
      render: (r) => <span className="text-xs text-gray-600 dark:text-gray-300">{r.ticker?.sector || '-'}</span>,
    },
    {
      key: 'ticker.employees',
      header: <>Employees {icon('ticker.employees')}</>,
      align: 'right',
      sortable: true,
      render: (r) => (
        <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200">
          {r.ticker?.employees != null ? r.ticker.employees.toLocaleString('en-US') : '-'}
        </span>
      ),
    },
    {
      key: 'analyst.buy',
      header: <>Analysts {icon('analyst.buy')}</>,
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
      ),
    },
    {
      key: 'ticker.lastPrice',
      header: <>Price {icon('ticker.lastPrice')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <LivePrice value={r.ticker?.lastPrice ?? null} format={(v) => `$${v.toFixed(2)}`} />,
    },
    {
      key: 'ticker.lastChangePct',
      header: <>Change % {icon('ticker.lastChangePct')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const pct = r.ticker?.lastChangePct ?? null;
        return (
          <span className={`text-sm font-semibold tabular-nums ${pct == null ? 'text-gray-400' : pct >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '-'}
          </span>
        );
      },
    },
    {
      key: 'ticker.lastMarketCap',
      header: <>Market Cap {icon('ticker.lastMarketCap')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-gray-700 dark:text-gray-200">{r.ticker?.lastMarketCap ? formatBillions(r.ticker.lastMarketCap) : '-'}</span>,
    },
    {
      key: 'ticker.lastMarketCapDiff',
      header: <>MCap Δ {icon('ticker.lastMarketCapDiff')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const d = r.ticker?.marketCapDiff ?? null;
        return (
          <span className={`text-sm tabular-nums ${d == null ? 'text-gray-400' : d >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {d != null ? formatMarketCapDiff(d) : '-'}
          </span>
        );
      },
    },
    {
      key: 'overallScore',
      header: <>Overall {icon('overallScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.overallScore} bold />,
    },
    {
      key: 'valuationScore',
      header: <>Value {icon('valuationScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.valuationScore} />,
    },
    {
      key: 'growthScore',
      header: <>Growth {icon('growthScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.growthScore} />,
    },
    {
      key: 'profitabilityScore',
      header: <>Profit. {icon('profitabilityScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.profitabilityScore} />,
    },
    {
      key: 'healthScore',
      header: <>Health {icon('healthScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.healthScore} />,
    },
    {
      key: 'qualityScore',
      header: <>Quality {icon('qualityScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.qualityScore} />,
    },
    {
      key: 'moatScore',
      header: <>Moat {icon('moatScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <ScoreCell v={r.moatScore ?? null} />,
    },
    {
      key: 'altmanZ',
      header: <>Altman Z {icon('altmanZ')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const z = altmanZLabel(r.altmanZ);
        return <span className={z.color}>{r.altmanZ !== null ? r.altmanZ.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'piotroskiScore',
      header: <>Piotroski {icon('piotroskiScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const p = piotroskiLabel(r.piotroskiScore);
        return <span className={p.color}>{r.piotroskiScore !== null ? `${r.piotroskiScore}/9` : '-'}</span>;
      },
    },
    {
      key: 'beneishScore',
      header: <>Beneish M {icon('beneishScore')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const b = beneishLabel(r.beneishScore);
        return <span className={b.color}>{r.beneishScore !== null ? r.beneishScore.toFixed(2) : '-'}</span>;
      },
    },
    {
      key: 'fcfMargin',
      header: <>FCF Margin {icon('fcfMargin')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const f = fcfMarginLabel(r.fcfMargin);
        return <span className={f.color}>{r.fcfMargin !== null ? `${(r.fcfMargin * 100).toFixed(1)}%` : '-'}</span>;
      },
    },
    {
      key: 'fcfConversion',
      header: <>FCF Conv. {icon('fcfConversion')}</>,
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
      header: <>Debt Repay {icon('debtRepaymentYears')}</>,
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
      header: <>Rev CAGR {icon('revenueCagr')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year revenue CAGR">{r.revenueCagr !== null ? `${r.revenueCagr > 0 ? '+' : ''}${r.revenueCagr.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'netIncomeCagr',
      header: <>NI CAGR {icon('netIncomeCagr')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year net income CAGR">{r.netIncomeCagr !== null ? `${r.netIncomeCagr > 0 ? '+' : ''}${r.netIncomeCagr.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'epsCagr5y',
      header: <>EPS CAGR {icon('epsCagr5y')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="5-year diluted EPS CAGR">{r.epsCagr5y != null ? `${r.epsCagr5y > 0 ? '+' : ''}${r.epsCagr5y.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'roic',
      header: <>ROIC {icon('roic')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="Return on Invested Capital (TTM NOPAT ÷ invested capital)">{r.roic != null ? `${r.roic.toFixed(1)}%` : '-'}</span>,
    },
    {
      key: 'priceToCash',
      header: <>P/Cash {icon('priceToCash')}</>,
      align: 'right',
      sortable: true,
      render: (r) => <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="Market cap ÷ cash & short-term investments">{r.priceToCash != null ? `${r.priceToCash.toFixed(1)}×` : '-'}</span>,
    },
    {
      key: 'rsi14',
      header: <>RSI 14 {icon('rsi14')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.rsi14;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v <= 30 ? 'text-green-600 dark:text-green-400 font-semibold' : v >= 70 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title="14-day Wilder RSI (<30 oversold, >70 overbought)">{v.toFixed(0)}</span>;
      },
    },
    ...TECH_PERF_COLUMNS.map(([key, hdr, tip]): ColumnDef<ScreenerResult> => ({
      key,
      header: <>{hdr} {icon(key)}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r[key];
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v > 0 ? 'text-green-600 dark:text-green-400' : v < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title={tip}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
      },
    })),
    {
      key: 'ticker.latestMoversRVOL',
      header: <>RVOL {icon('ticker.latestMoversRVOL')}</>,
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
      header: <>Vol 20D {icon('ticker.stdDevReturn20d')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.ticker?.stdDevReturn20d;
        return v != null ? <span className="text-sm tabular-nums text-gray-700 dark:text-gray-200" title="20-day daily return standard deviation">{v.toFixed(2)}%</span> : <span className="text-gray-400">-</span>;
      },
    },
    {
      key: 'marginStability',
      header: <>Margin σ {icon('marginStability')}</>,
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
      header: <>P/E %ile {icon('pePercentile')}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r.pePercentile;
        if (v == null) return <span className="text-gray-400">-</span>;
        const color = v <= 30 ? 'text-green-600 dark:text-green-400' : v >= 70 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200';
        return <span className={`text-sm tabular-nums ${color}`} title="Current P/E percentile vs own valuation history (0 = cheapest day on record, 100 = most expensive)">{Math.round(v)}ᵗʰ</span>;
      },
    },
    ...PE_MEDIAN_WINDOWS.map((w): ColumnDef<ScreenerResult> => ({
      key: w.key,
      header: <>P/E vs {w.label} Med {icon(w.key)}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
        const v = r[w.key];
        if (v == null) return <span className="text-gray-400">-</span>;
        return <span className={`text-sm tabular-nums ${v < 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`} title={`Current P/E vs its own trailing ${w.label} median P/E — negative = below (cheaper), positive = above (pricier)`}>{v > 0 ? '+' : ''}{v.toFixed(0)}%</span>;
      },
    })),
    {
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
    ...METRIC_FILTERS.map((def): ColumnDef<ScreenerResult> => ({
      key: `metrics.${def.key}`,
      header: <>{def.label.replace(/ %$/, '')} {icon(`metrics.${def.key}`)}</>,
      align: 'right',
      sortable: true,
      render: (r) => {
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
      header: <>Insider 90D {icon('insider.netBuyValue90d')}</>,
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
      header: <>Top Buy {icon('insider.largestBuyValue90d')}</>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestBuyValue90d != null
        ? <span className="text-sm tabular-nums text-green-600 dark:text-green-400" title="Largest single open-market insider purchase, 90D">{formatCurrencyCompact(r.insiderLargestBuyValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.largestSellValue90d',
      header: <>Top Sell {icon('insider.largestSellValue90d')}</>,
      align: 'right',
      sortable: true,
      render: (r) => r.insiderLargestSellValue90d != null
        ? <span className="text-sm tabular-nums text-red-600 dark:text-red-400" title="Largest single open-market insider sale, 90D">{formatCurrencyCompact(r.insiderLargestSellValue90d)}</span>
        : <span className="text-gray-400">-</span>,
    },
    {
      key: 'insider.uniqueSellers14d',
      header: <>Cluster 14D {icon('insider.uniqueSellers14d')}</>,
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
  ];
}

export function ScreenerMobileCard({ r, onSelect }: { r: ScreenerResult; onSelect: (symbol: string) => void }) {
  const chg = r.ticker?.lastChangePct ?? null;
  return (
    <div
      onClick={() => onSelect(r.symbol)}
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
          ['Moat', r.moatScore ?? null],
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
}
