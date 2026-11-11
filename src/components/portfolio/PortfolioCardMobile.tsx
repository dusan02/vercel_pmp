'use client';

import React, { memo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, BarChart3, Trash2, TrendingUp, TrendingDown, Clock, ShieldCheck } from 'lucide-react';
import { StockData } from '@/lib/types';
import CompanyLogo from '../CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { formatCurrencyCompact, formatPercent, formatPrice } from '@/lib/utils/format';
import { scoreColor } from '@/lib/utils/screener';

export interface PortfolioCardMobileProps {
  stock: StockData;
  quantity: number;
  avgCost?: number | undefined;
  weight?: number | undefined;
  positionValue?: number | undefined;
  dailyPnl?: number | undefined;
  totalPnl?: number | null | undefined;
  totalRetPct?: number | null | undefined;
  isTrend?: boolean | undefined;
  onEdit?: ((ticker: string) => void) | undefined;
  onRemove: (ticker: string) => void;
  onClick?: (() => void) | undefined;
  calculateValue?: ((stock: StockData) => number) | undefined;
  onUpdateQuantity?: ((ticker: string, quantity: number) => void) | undefined;
  onUpdateCostBasis?: ((ticker: string, avgPrice: number) => void) | undefined;
}

export const PortfolioCardMobile = memo(({
  stock,
  quantity,
  avgCost = 0,
  weight = 0,
  positionValue: propPositionValue,
  dailyPnl: propDailyPnl,
  totalPnl: propTotalPnl,
  totalRetPct: propTotalRetPct,
  isTrend = false,
  onEdit,
  onRemove,
  onClick,
}: PortfolioCardMobileProps) => {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const price = stock.currentPrice || stock.closePrice || 0;
  const positionValue = propPositionValue ?? (quantity * price);
  const invested = avgCost > 0 ? quantity * avgCost : 0;
  const totalPnl = propTotalPnl !== undefined ? propTotalPnl : (invested > 0 ? positionValue - invested : null);
  const totalRetPct = propTotalRetPct !== undefined ? propTotalRetPct : (invested > 0 ? (positionValue / invested - 1) * 100 : null);

  const pct = stock.percentChange ?? 0;
  const isPos = pct >= 0;

  // Daily P&L ($)
  const dailyPnl = propDailyPnl ?? (() => {
    if (quantity <= 0) return 0;
    const prevPrice = price / (1 + pct / 100);
    return (price - prevPrice) * quantity;
  })();
  const dailyPnlIsPos = dailyPnl >= 0;

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else if (onEdit) {
      onEdit(stock.ticker);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    onRemove(stock.ticker);
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 active:scale-[0.995] transition-all cursor-pointer relative overflow-hidden"
    >
      {/* 1. Header: Logo + Ticker/Name + Price/Daily P&L */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: Logo & Identification */}
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo
            ticker={stock.ticker}
            size={42}
            className="rounded-xl shrink-0 bg-slate-100 dark:bg-slate-800 shadow-sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                {stock.ticker}
              </span>

              {isTrend && (
                <span
                  className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                  title="Trend × Fundamentals: rev/share +30%, EPS growing"
                >
                  T×F
                </span>
              )}

              {stock.earningsDays != null && stock.earningsDays <= 14 && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-0.5"
                  title={`Reports earnings in ${stock.earningsDays} days`}
                >
                  <Clock size={9} />
                  {stock.earningsDays === 0 ? 'Today' : stock.earningsDays === 1 ? 'Tmrw' : `${stock.earningsDays}d`}
                </span>
              )}

              {stock.overallScore != null && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 tabular-nums ${scoreColor(stock.overallScore)}`}
                  title="PMP Composite Score (0–100)"
                >
                  {stock.overallScore}
                </span>
              )}
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px] sm:max-w-[200px] mt-0.5">
              {stock.companyName || getCompanyName(stock.ticker)}
            </div>
          </div>
        </div>

        {/* Right: Position Value + Today's Change */}
        <div className="text-right shrink-0">
          <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight">
            ${formatPrice(positionValue)}
          </div>
          <div
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums mt-0.5 ${
              isPos
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            <span>{formatCurrencyCompact(dailyPnl, true)}</span>
            <span className="opacity-75">({formatPercent(pct)})</span>
          </div>
        </div>
      </div>

      {/* 2. Middle Row: Holdings Info Grid */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2 text-xs">
        {/* Shares info */}
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
            Holdings
          </div>
          <div className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {quantity} {quantity === 1 ? 'share' : 'shares'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            @ ${formatPrice(price)}
          </div>
        </div>

        {/* Total return & Cost Basis */}
        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-0.5">
            Total Return
          </div>
          {totalPnl !== null ? (
            <>
              <div
                className={`font-bold tabular-nums ${
                  totalPnl >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatCurrencyCompact(totalPnl, true)} ({(totalRetPct ?? 0) >= 0 ? '+' : ''}{(totalRetPct ?? 0).toFixed(1)}%)
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                Avg buy: ${formatPrice(avgCost)}
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.(stock.ticker);
              }}
              className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold hover:underline mt-1 flex items-center gap-1"
            >
              + Add buy price
            </button>
          )}
        </div>
      </div>

      {/* 3. Portfolio Weight Bar */}
      {weight > 0 && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mb-1">
            <span>Portfolio weight</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {weight.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(1, weight))}%` }}
            />
          </div>
        </div>
      )}

      {/* 4. Action Row */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(stock.ticker);
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all"
        >
          <Pencil size={13} />
          <span>Edit Position</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/analysis/${stock.ticker.toUpperCase()}`);
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-95 transition-all"
        >
          <BarChart3 size={13} />
          <span>Analysis</span>
        </button>

        <button
          type="button"
          onClick={handleRemove}
          className={`p-2 rounded-xl transition-all ${
            confirmDelete
              ? 'bg-rose-600 text-white animate-pulse'
              : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30'
          }`}
          title={confirmDelete ? 'Tap again to delete' : `Remove ${stock.ticker}`}
          aria-label={confirmDelete ? 'Confirm remove' : `Remove ${stock.ticker}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
});

PortfolioCardMobile.displayName = 'PortfolioCardMobile';
