'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Plus, Download, Link2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { SectionIcon } from './SectionIcon';
import { SectionLoader } from './SectionLoader';
import CompanyLogo from './CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { StockData } from '@/lib/types';
import { PortfolioQuantityInput } from './PortfolioQuantityInput';
import { PortfolioCardMobile } from './PortfolioCardMobile';
import { PortfolioPerformanceChart } from './PortfolioPerformanceChart';
import { UniversalTable, ColumnDef } from './UniversalTable';
import { PortfolioSectorDistributionChart } from './PortfolioSectorDistributionChart';
import { PortfolioStockDistributionChart } from './PortfolioStockDistributionChart';
import { PortfolioPerformanceTreemap } from './PortfolioTreemapNew';
import { formatCurrencyCompact, formatPercent, formatPrice, formatSectorName } from '@/lib/utils/format';
import { scoreColor } from '@/lib/utils/screener';
import { event } from '@/lib/ga';
import { useSortableData, SortKey } from '@/hooks/useSortableData';
import {
  BUTTON_PRIMARY_MD,
  BUTTON_ICON,
  BUTTON_ICON_DANGER,
  BUTTON_SECONDARY
} from '@/lib/utils/buttonStyles';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface PortfolioSectionProps {
  portfolioStocks: StockData[];
  portfolioHoldings: Record<string, number>;
  costBasis?: Record<string, number> | undefined;
  allStocks: StockData[];
  loading: boolean;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onUpdateCostBasis?: ((ticker: string, avgPrice: number) => void) | undefined;
  onRemoveStock: (ticker: string) => void;
  onAddStock: (ticker: string, quantity?: number) => void;
  calculatePortfolioValue: (stock: StockData) => number; // Daily change
  calculateTotalValue?: ((stock: StockData) => number) | undefined; // Total value (NEW)
  totalPortfolioValue: number;
}

export function PortfolioSection({
  portfolioStocks,
  portfolioHoldings,
  costBasis = {},
  allStocks,
  loading,
  onUpdateQuantity,
  onUpdateCostBasis,
  onRemoveStock,
  onAddStock,
  calculatePortfolioValue,
  calculateTotalValue,
  totalPortfolioValue
}: PortfolioSectionProps) {
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [portfolioSearchTerm, setPortfolioSearchTerm] = useState('');
  const [portfolioSearchResults, setPortfolioSearchResults] = useState<StockData[]>([]);
  const [showPortfolioSearch, setShowPortfolioSearch] = useState(false);
  const [trendUniverse, setTrendUniverse] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  const handleRowClick = useCallback((stock: StockData) => {
    router.push(`/analysis/${stock.ticker.toUpperCase()}`);
  }, [router]);

  // Trend-qualified universe (badge) — same cached list as ?trendConfirmed=1
  useEffect(() => {
    fetch('/api/analysis/trend-universe')
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => { if (Array.isArray(d.symbols)) setTrendUniverse(new Set(d.symbols)); })
      .catch(() => {});
  }, []);

  // Pre-calculate value (Daily P&L) and quantity for sorting
  const enhancedPortfolioStocks = useMemo(() => {
    return portfolioStocks.map(stock => {
      const pnl = calculatePortfolioValue(stock) || 0;
      const qty = portfolioHoldings[stock.ticker] || 0;
      const price = stock.currentPrice || stock.closePrice || 0;
      const positionValue = qty * price;
      const cost = costBasis[stock.ticker] || 0;
      const invested = cost > 0 ? qty * cost : 0;
      const totalPnl = invested > 0 ? positionValue - invested : null;
      const totalRetPct = invested > 0 ? (positionValue / invested - 1) * 100 : null;
      return {
        ...stock,
        value: pnl,
        dailyPnl: pnl,
        quantity: qty,
        positionValue,
        weight: totalPortfolioValue > 0 ? (positionValue / totalPortfolioValue) * 100 : 0,
        totalPnl,
        totalRetPct,
      };
    });
  }, [portfolioStocks, portfolioHoldings, calculatePortfolioValue, costBasis, totalPortfolioValue]);

  type EnhancedStock = (typeof enhancedPortfolioStocks)[number];

  // Sorting Logic
  const {
    sorted: sortedPortfolioStocks,
    sortKey,
    ascending,
    requestSort
  } = useSortableData(enhancedPortfolioStocks, 'ticker', true);

  // Calculate Global Stats (Daily Change)
  const totalDailyChange = useMemo(() => {
    return portfolioStocks.reduce((sum, stock) => sum + (calculatePortfolioValue(stock) || 0), 0);
  }, [portfolioStocks, calculatePortfolioValue]);

  const weightedDailyChangePercent = useMemo(() => {
    if (totalPortfolioValue === 0) return 0;
    // Derived from P&L and Total Value
    // P&L / (Value - P&L) * 100 ?
    // If portfolio value is 1000, and P&L is 100. Previous was 900. 100/900 = 11.1%.
    // If P&L is percent of TODAY's value?
    // Usually "Daily Change %" is Sum(Change) / Sum(PreviousValue).
    // PreviousValue = TotalValue - TotalDailyChange.
    const previousValue = totalPortfolioValue - totalDailyChange;
    if (previousValue === 0) return 0;
    return (totalDailyChange / previousValue) * 100;
  }, [totalDailyChange, totalPortfolioValue]);

  // Total P&L across positions that have a cost basis set
  const { totalPnl, totalInvested, totalReturnPct, hasCostBasis } = useMemo(() => {
    let pnl = 0, invested = 0;
    for (const s of enhancedPortfolioStocks) {
      if (s.totalPnl !== null) { pnl += s.totalPnl; invested += s.positionValue - s.totalPnl; }
    }
    return {
      totalPnl: pnl,
      totalInvested: invested,
      totalReturnPct: invested > 0 ? (pnl / invested) * 100 : 0,
      hasCostBasis: invested > 0,
    };
  }, [enhancedPortfolioStocks]);

  // Insights strip: concentration, sector mix, earnings, avg score, trend count
  const insights = useMemo(() => {
    const withValue = enhancedPortfolioStocks.filter(s => s.positionValue > 0);
    if (withValue.length === 0) return null;
    const top = [...withValue].sort((a, b) => b.positionValue - a.positionValue)[0];
    if (!top) return null;
    const bySector = new Map<string, number>();
    for (const s of withValue) {
      const sec = s.sector || 'Unknown';
      bySector.set(sec, (bySector.get(sec) || 0) + s.positionValue);
    }
    const topSector = [...bySector.entries()].sort((a, b) => b[1] - a[1])[0];
    const earningSoon = withValue.filter(s => s.earningsDays != null && s.earningsDays <= 7);
    const scored = withValue.filter(s => s.overallScore != null);
    const avgScore = scored.length ? Math.round(scored.reduce((a, s) => a + (s.overallScore || 0), 0) / scored.length) : null;
    const trendCount = withValue.filter(s => trendUniverse.has(s.ticker)).length;
    return { top, topSector, earningSoon, avgScore, trendCount, n: withValue.length };
  }, [enhancedPortfolioStocks, trendUniverse]);

  const exportCsv = useCallback(() => {
    const rows = [
      ['ticker', 'quantity', 'avg_cost', 'price', 'value', 'weight_pct', 'daily_change_pct', 'daily_pnl', 'total_pnl', 'total_return_pct'],
      ...enhancedPortfolioStocks.map(s => [
        s.ticker,
        s.quantity,
        costBasis[s.ticker] ?? '',
        (s.currentPrice || s.closePrice || 0).toFixed(2),
        s.positionValue.toFixed(2),
        s.weight.toFixed(2),
        (s.percentChange ?? 0).toFixed(2),
        s.dailyPnl.toFixed(2),
        s.totalPnl !== null ? s.totalPnl.toFixed(2) : '',
        s.totalRetPct !== null ? s.totalRetPct.toFixed(2) : '',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'pmp-portfolio.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    event('portfolio_export_csv', { click_source: 'portfolio' });
  }, [enhancedPortfolioStocks, costBasis]);

  const copyShareLink = useCallback(() => {
    const p = enhancedPortfolioStocks
      .filter(s => s.quantity > 0)
      .map(s => `${s.ticker}:${s.quantity}${costBasis[s.ticker] ? `@${costBasis[s.ticker]}` : ''}`)
      .join(',');
    const url = `${window.location.origin}/portfolio?p=${encodeURIComponent(p)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
    event('portfolio_share_link', { click_source: 'portfolio' });
  }, [enhancedPortfolioStocks, costBasis]);

  // Search Logic
  useEffect(() => {
    if (portfolioSearchTerm.trim() === '') {
      setPortfolioSearchResults([]);
      return;
    }
    const term = portfolioSearchTerm.toLowerCase();
    const results = allStocks.filter(
      (stock) =>
        stock.ticker.toLowerCase().includes(term) ||
        (stock.companyName || '').toLowerCase().includes(term) ||
        getCompanyName(stock.ticker).toLowerCase().includes(term)
    ).slice(0, 10); // Increased from 5 to 10 for better user experience
    setPortfolioSearchResults(results);
  }, [portfolioSearchTerm, allStocks]);

  // Column Definitions
  const columns: ColumnDef<EnhancedStock>[] = useMemo(() => [
    {
      key: 'logo',
      header: 'Logo',
      align: 'center',
      className: 'hidden md:table-cell',
      width: '72px',
      render: (stock) => (
        <div className="flex justify-center">
          <CompanyLogo
            ticker={stock.ticker}
            size={44}
            priority={true}
          />
        </div>
      )
    },
    {
      key: 'ticker',
      header: 'Stock',
      sortable: true,
      align: 'left',
      showInMobileSort: true,
      mobileWidth: 'w-28',
      render: (stock) => (
        <div className="flex items-center gap-1.5">
          <strong>{stock.ticker}</strong>
          {trendUniverse.has(stock.ticker) && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap"
              title="Trend × Fundamentals: rev/share +30% (1Y), EPS growing, ≥80% of 52w high"
            >
              T×F
            </span>
          )}
          {stock.earningsDays != null && stock.earningsDays <= 14 && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap"
              title={`Reports earnings ${stock.earningsDays === 0 ? 'today' : stock.earningsDays === 1 ? 'tomorrow' : `in ${stock.earningsDays} days`}`}
            >
              Earn {stock.earningsDays === 0 ? 'today' : stock.earningsDays === 1 ? 'tmrw' : `${stock.earningsDays}d`}
            </span>
          )}
        </div>
      )
    },
    {
      key: isDesktop ? 'currentPrice' : 'value',
      header: isDesktop ? 'Price' : 'Value',
      sortable: true,
      align: 'right',
      className: 'text-right',
      showInMobileSort: true,
      mobileWidth: 'w-24',
      disableRowClick: true,
      render: (stock) => {
        const price = stock.currentPrice ?? 0;
        return <span className="tabular-nums block w-full text-right">${isFinite(price) ? formatPrice(price) : '0.00'}</span>;
      }
    },
    {
      key: 'quantity',
      header: '#',
      align: 'center',
      showInMobileSort: true,
      mobileWidth: 'w-16',
      disableRowClick: true,
      render: (stock) => (
        <PortfolioQuantityInput
          value={portfolioHoldings[stock.ticker] || 0}
          onChange={(newQuantity) => onUpdateQuantity(stock.ticker, newQuantity)}
          className="min-w-[80px] w-20 mx-auto"
        />
      )
    },
    {
      key: 'avgCost',
      header: 'Avg Cost',
      align: 'center',
      className: 'hidden lg:table-cell',
      disableRowClick: true,
      render: (stock) => (
        <PortfolioQuantityInput
          value={costBasis[stock.ticker] || 0}
          onChange={(v) => onUpdateCostBasis?.(stock.ticker, v)}
          className="min-w-[72px] w-[72px] mx-auto"
          placeholder="—"
          title="Average buy price — enables total P&L"
          decimals={4}
        />
      )
    },
    {
      key: 'positionValue',
      header: 'Value',
      sortable: isDesktop,
      align: 'right',
      className: 'text-right hidden md:table-cell',
      showInMobileSort: false,
      disableRowClick: true,
      render: (stock) => (
        <div className="tabular-nums text-right">
          <span className="block font-medium">{formatCurrencyCompact(stock.positionValue, true)}</span>
          <span className="block text-[10px] text-[var(--clr-subtext)]">{stock.weight.toFixed(1)}%</span>
        </div>
      )
    },
    {
      key: 'companyName',
      header: 'Company',
      className: 'hidden md:table-cell',
      render: (stock) => <span className="block truncate max-w-[180px]">{getCompanyName(stock.ticker)}</span>
    },
    {
      key: 'sector',
      header: 'Sector',
      sortable: true,
      className: 'hidden md:table-cell',
      disableRowClick: true,
      render: (stock) => formatSectorName(stock.sector)
    },
    {
      key: 'industry',
      header: 'Industry',
      sortable: true,
      className: 'hidden md:table-cell',
      disableRowClick: true,
      render: (stock) => stock.industry || 'N/A'
    },
    {
      key: 'overallScore',
      header: 'Score',
      sortable: isDesktop,
      align: 'right',
      className: 'text-right hidden md:table-cell',
      disableRowClick: true,
      render: (stock) => (
        <span className={`tabular-nums font-bold ${scoreColor(stock.overallScore ?? null)}`} title="PMP Composite Score (0–100)">
          {stock.overallScore != null ? stock.overallScore : '—'}
        </span>
      )
    },
    {
      key: 'percentChange',
      header: '% Change',
      sortable: isDesktop,
      align: 'right',
      className: 'text-right hidden md:table-cell',
      disableRowClick: true,
      render: (stock) => {
        const pct = stock.percentChange ?? 0;
        return (
          <span className={`tabular-nums ${pct >= 0 ? 'positive' : 'negative'}`}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
          </span>
        );
      }
    },
    {
      key: 'dailyPnl',
      header: 'Daily P&L',
      sortable: isDesktop,
      align: 'right',
      disableRowClick: true,
      render: (stock) => {
        const value = calculatePortfolioValue(stock);
        return (
          <span className={`tabular-nums ${value >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrencyCompact(value, true)}
          </span>
        );
      }
    },
    {
      key: 'totalPnl',
      header: 'Total P&L',
      sortable: isDesktop,
      align: 'right',
      className: 'hidden lg:table-cell text-right',
      disableRowClick: true,
      render: (stock) => {
        if (stock.totalPnl === null) return <span className="text-gray-300 dark:text-gray-600">—</span>;
        return (
          <div className={`tabular-nums text-right ${stock.totalPnl >= 0 ? 'positive' : 'negative'}`}>
            <span className="block font-medium">{formatCurrencyCompact(stock.totalPnl, true)}</span>
            <span className="block text-[10px] opacity-80">
              {(stock.totalRetPct ?? 0) >= 0 ? '+' : ''}{(stock.totalRetPct ?? 0).toFixed(1)}%
            </span>
          </div>
        );
      }
    },
    {
      key: 'actions',
      header: '',
      align: 'center',
      width: '88px',
      showInMobileSort: false, // Hide label in mobile sort header
      disableRowClick: true,
      render: (stock) => (
        <button
          className="flex items-center justify-center w-8 h-8 mx-auto rounded-lg text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-red-900/20 transition-all duration-200"
          onClick={() => onRemoveStock(stock.ticker)}
          aria-label={`Remove ${stock.ticker} from portfolio`}
          title="Remove from portfolio"
        >
          <X size={18} />
        </button>
      )
    }
  ], [portfolioHoldings, onUpdateQuantity, onUpdateCostBasis, onRemoveStock, calculatePortfolioValue, isDesktop, costBasis, trendUniverse]);

  // Transform data for charts
  const chartData = useMemo(() => {
    return portfolioStocks.map(stock => {
      const quantity = portfolioHoldings[stock.ticker] || 0;
      const currentPrice = stock.currentPrice || 0;
      const value = quantity * currentPrice; // Total Position Value
      const dailyChangeValue = calculatePortfolioValue(stock); // Daily P&L
      const cost = costBasis[stock.ticker] || 0;

      return {
        ticker: stock.ticker,
        value: value,
        dailyChangePercent: stock.percentChange || 0,
        dailyChangeValue: dailyChangeValue,
        totalReturnPercent: cost > 0 && quantity > 0 ? (value / (quantity * cost) - 1) * 100 : null,
        totalPnl: cost > 0 && quantity > 0 ? value - quantity * cost : null,
        sector: stock.sector || 'Unknown',
        industry: stock.industry || 'Unknown'
      };
    });
  }, [portfolioStocks, portfolioHoldings, calculatePortfolioValue, costBasis]);

  if (loading) {
    return (
      <section className="portfolio">
        <div className="flex items-center justify-between mb-4 px-4">
          <div className="flex items-center">
            <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-1.5">
              <SectionIcon type="pie" size={28} className="text-gray-900 dark:text-white shrink-0" />
              <span>Portfolio</span>
            </h2>
          </div>
        </div>
        <SectionLoader message="Loading portfolio..." />
      </section>
    );
  }

  // Footer Row for UniversalTable
  const footerRow = portfolioStocks.length > 0 ? (
    <tr className="portfolio-total-row hidden md:table-row" style={{ backgroundColor: 'var(--clr-bg-yellow-light, #fffbeb)', borderTop: '3px double #3b82f6' }}>
      <td colSpan={10} className="text-right font-semibold py-4 px-2 align-middle">
        Total:
      </td>
      <td className={`${weightedDailyChangePercent >= 0 ? 'positive' : 'negative'} text-right tabular-nums font-semibold py-4 px-2 whitespace-nowrap align-middle`}>
        {formatPercent(weightedDailyChangePercent)}
      </td>
      <td className={`${totalDailyChange >= 0 ? 'positive' : 'negative'} text-right tabular-nums font-semibold py-4 px-2 whitespace-nowrap align-middle min-w-[120px]`}>
        {formatCurrencyCompact(totalDailyChange, true)}
      </td>
      <td className={`${hasCostBasis && totalPnl >= 0 ? 'positive' : 'negative'} text-right tabular-nums font-semibold py-4 px-2 whitespace-nowrap align-middle`}>
        {hasCostBasis ? formatCurrencyCompact(totalPnl, true) : ''}
      </td>
      <td></td>
    </tr>
  ) : null;

  return (
    <section className="portfolio">
      <div className="flex items-center justify-between mb-4 px-4">
        <div className="flex items-center">
          <h2 className="flex items-center gap-3 text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white m-0 relative -top-1.5">
            <SectionIcon type="pie" size={28} className="text-gray-900 dark:text-white shrink-0" />
            <span>Portfolio</span>
          </h2>
        </div>

        {/* Desktop Stats (Header) */}
        {portfolioStocks.length > 0 && (
          <div className="portfolio-stats hidden md:flex gap-8 items-baseline">
            <div className="flex gap-2 items-baseline">
              <span className="text-[var(--clr-subtext)] text-base">Total Value:</span>
              <span className="text-2xl font-bold">{formatCurrencyCompact(totalPortfolioValue, true)}</span>
            </div>
            <div className="flex gap-2 items-baseline">
              <span className="text-[var(--clr-subtext)] text-base">Daily Change:</span>
              <span className={`text-2xl font-bold ${totalDailyChange >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrencyCompact(totalDailyChange, true)} <span className="text-lg font-medium text-opacity-80">({formatPercent(weightedDailyChangePercent)})</span>
              </span>
            </div>
            {hasCostBasis && (
              <div className="flex gap-2 items-baseline">
                <span className="text-[var(--clr-subtext)] text-base">Total P&L:</span>
                <span className={`text-2xl font-bold ${totalPnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrencyCompact(totalPnl, true)} <span className="text-lg font-medium text-opacity-80">({formatPercent(totalReturnPct)})</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Export / share actions */}
        {portfolioStocks.length > 0 && (
          <div className="flex gap-1.5">
            <button
              onClick={exportCsv}
              className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Export portfolio to CSV"
              aria-label="Export CSV"
            >
              <Download size={18} />
            </button>
            <button
              onClick={copyShareLink}
              className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={copied ? 'Copied!' : 'Copy share link'}
              aria-label="Copy share link"
            >
              {copied ? <span className="text-xs font-bold text-emerald-500">✓</span> : <Link2 size={18} />}
            </button>
          </div>
        )}
      </div>

      {/* Sign-in sync nudge for anonymous users */}
      {!session?.user && portfolioStocks.length >= 3 && (
        <div className="mx-4 mb-4 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Your portfolio is saved only in this browser — sign in to sync it across devices.
          </p>
          <button
            onClick={() => signIn('google')}
            className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0"
          >
            Sign in
          </button>
        </div>
      )}

      {/* Insights strip */}
      {insights && (
        <div className="mx-4 mb-4 flex flex-wrap gap-2">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${insights.top.weight > 30 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`} title="Largest position weight">
            Top: {insights.top.ticker} {insights.top.weight.toFixed(0)}%
          </span>
          {insights.topSector && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${(insights.topSector[1] / Math.max(1, totalPortfolioValue)) * 100 > 50 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`} title="Largest sector weight">
              {formatSectorName(insights.topSector[0])} {((insights.topSector[1] / Math.max(1, totalPortfolioValue)) * 100).toFixed(0)}%
            </span>
          )}
          {insights.earningSoon.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400" title={insights.earningSoon.map(s => `${s.ticker} (${s.earningsDays}d)`).join(', ')}>
              Earnings ≤7d: {insights.earningSoon.length}
            </span>
          )}
          {insights.avgScore !== null && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400" title="Average PMP Composite Score">
              Avg score: {insights.avgScore}
            </span>
          )}
          {trendUniverse.size > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" title="Holdings passing the Trend × Fundamentals signal">
              T×F: {insights.trendCount}/{insights.n}
            </span>
          )}
        </div>
      )}

      {/* Mobile Stats Card (since table footer logic is desktop only) */}
      {portfolioStocks.length > 0 && (
        <div className="lg:hidden bg-white dark:bg-white/5 mx-3 mb-4 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-800">
            <div className="pr-4">
              <div className="text-xs text-[var(--clr-subtext)] mb-1">Total Value</div>
              <div className="text-lg font-bold">{formatCurrencyCompact(totalPortfolioValue, true)}</div>
            </div>
            <div className="pl-4">
              <div className="text-xs text-[var(--clr-subtext)] mb-1">Daily Change</div>
              <div className={`text-lg font-bold ${totalDailyChange >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrencyCompact(totalDailyChange, true)} <span className="text-sm font-medium">({formatPercent(weightedDailyChangePercent)})</span>
              </div>
            </div>
          </div>
        </div>
      )}



      {/* 3. Search Bar - Above Table */}
      <div className="px-4 mb-4 relative mt-2">
        <div className="relative group">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <input
            type="text"
            placeholder="Search stocks to add..."
            value={portfolioSearchTerm}
            onChange={(e) => setPortfolioSearchTerm(e.target.value)}
            onFocus={() => setShowPortfolioSearch(true)}
            onBlur={() => setTimeout(() => setShowPortfolioSearch(false), 200)}
            className="pmp-input h-11 sm:h-12 text-base !pl-10 !pr-9"
          />
          {portfolioSearchTerm && (
            <button
              type="button"
              onClick={() => setPortfolioSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}

          {showPortfolioSearch && portfolioSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 pmp-dropdown-menu mt-2">
              {portfolioSearchResults.map((stock) => (
                <button
                  key={stock.ticker}
                  className="pmp-dropdown-option border-b last:border-0 border-gray-100 dark:border-gray-700/50"
                  onClick={() => {
                    onAddStock(stock.ticker);
                    setPortfolioSearchTerm('');
                  }}
                >
                  <span className="font-bold text-blue-600 dark:text-blue-400 w-16 shrink-0">{stock.ticker}</span>
                  <span className="text-gray-300 mx-2 shrink-0">|</span>
                  <span className="text-sm font-medium truncate flex-1 min-w-0">{stock.companyName || getCompanyName(stock.ticker)}</span>
                  <Plus size={18} className="text-gray-400 ml-2 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 4. Table */}
      <UniversalTable
        data={sortedPortfolioStocks}
        columns={columns}
        keyExtractor={(item) => item.ticker}
        isLoading={loading}
        sortKey={sortKey}
        ascending={ascending}
        onSort={requestSort}
        onRowClick={handleRowClick}
        emptyMessage={
          <div className="empty-portfolio text-center py-8">
            <div className="text-3xl mb-3 opacity-50">💼</div>
            <h3 className="text-base font-semibold mb-1">Your portfolio is empty</h3>
            <p className="text-sm text-[var(--clr-subtext)] mb-4">Add stocks to track your performance — or start with a sample:</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {['NVDA', 'AAPL', 'MSFT'].map(t => (
                <button
                  key={t}
                  onClick={() => onAddStock(t, 1)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-semibold"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        }
        renderMobileCard={(stock) => (
          <PortfolioCardMobile
            stock={stock}
            quantity={portfolioHoldings[stock.ticker] || 0}
            avgCost={costBasis[stock.ticker] || 0}
            onUpdateQuantity={onUpdateQuantity}
            onUpdateCostBasis={onUpdateCostBasis}
            onRemove={onRemoveStock}
            calculateValue={calculatePortfolioValue}
          />
        )}
        // forceTable={true} // REMOVED to enable mobile cards
        tfootRows={footerRow}
      />

      {/* Visualizations: Heatmap first, then 2x pie charts at the bottom */}
      {portfolioStocks.length > 0 && (
        <div className="mb-8 space-y-8 px-4 mt-8">
          <PortfolioPerformanceChart holdings={portfolioHoldings} />
          <PortfolioPerformanceTreemap data={chartData} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <PortfolioSectorDistributionChart data={chartData} />
            <PortfolioStockDistributionChart data={chartData} />
          </div>
        </div>
      )}
    </section>
  );
}
