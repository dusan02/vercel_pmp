'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, ArrowUpRight, Check, Zap, Plus, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { StockData } from '@/lib/types';
import CompanyLogo from '../CompanyLogo';
import { getCompanyName } from '@/lib/companyNames';
import { formatCurrencyCompact, formatPercent, formatPrice } from '@/lib/utils/format';

interface PortfolioPositionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  stock: StockData | null;
  currentQuantity: number;
  currentCostBasis: number;
  totalPortfolioValue: number;
  onUpdateQuantity: (ticker: string, quantity: number) => void;
  onUpdateCostBasis?: ((ticker: string, avgPrice: number) => void) | undefined;
  onRemoveStock: (ticker: string) => void;
}

export function PortfolioPositionSheet({
  isOpen,
  onClose,
  stock,
  currentQuantity,
  currentCostBasis,
  totalPortfolioValue,
  onUpdateQuantity,
  onUpdateCostBasis,
  onRemoveStock,
}: PortfolioPositionSheetProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState<number>(currentQuantity);
  const [quantityStr, setQuantityStr] = useState<string>(String(currentQuantity || ''));
  const [costBasis, setCostBasis] = useState<number>(currentCostBasis);
  const [costBasisStr, setCostBasisStr] = useState<string>(currentCostBasis > 0 ? String(currentCostBasis) : '');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  // Sync internal state whenever the target stock or open state changes
  useEffect(() => {
    if (isOpen && stock) {
      setQuantity(currentQuantity);
      setQuantityStr(currentQuantity > 0 ? String(currentQuantity) : '');
      setCostBasis(currentCostBasis);
      setCostBasisStr(currentCostBasis > 0 ? String(currentCostBasis) : '');
      setConfirmDelete(false);
    }
  }, [isOpen, stock, currentQuantity, currentCostBasis]);

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen]);

  const price = stock ? (stock.currentPrice || stock.closePrice || 0) : 0;
  const positionValue = quantity * price;
  const invested = costBasis > 0 ? quantity * costBasis : 0;
  const totalPnl = invested > 0 ? positionValue - invested : null;
  const totalRetPct = invested > 0 ? (positionValue / invested - 1) * 100 : null;

  // Daily P&L for this quantity
  const dailyPnl = useMemo(() => {
    if (!stock || quantity <= 0) return 0;
    const pct = (stock.percentChange ?? 0) / 100;
    const prevPrice = price / (1 + pct);
    return (price - prevPrice) * quantity;
  }, [stock, price, quantity]);

  // Handle quantity changes
  const applyQuantity = useCallback((val: number) => {
    const safe = Math.max(0, Math.min(1_000_000, Math.round(val * 10000) / 10000));
    setQuantity(safe);
    setQuantityStr(safe > 0 ? String(safe) : '');
  }, []);

  const handleQuantityInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/,/g, '');
    setQuantityStr(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && isFinite(parsed) && parsed >= 0) {
      setQuantity(Math.min(1_000_000, parsed));
    } else if (text === '') {
      setQuantity(0);
    }
  };

  const handleCostInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value.replace(/,/g, '');
    setCostBasisStr(text);
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && isFinite(parsed) && parsed >= 0) {
      setCostBasis(parsed);
    } else if (text === '') {
      setCostBasis(0);
    }
  };

  const handleSave = () => {
    if (!stock) return;
    onUpdateQuantity(stock.ticker, quantity);
    if (onUpdateCostBasis) {
      onUpdateCostBasis(stock.ticker, costBasis);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!stock) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onRemoveStock(stock.ticker);
    onClose();
  };

  const handleViewAnalysis = () => {
    if (!stock) return;
    onClose();
    router.push(`/analysis/${stock.ticker.toUpperCase()}`);
  };

  if (!stock) return null;

  const pct = stock.percentChange ?? 0;
  const isPos = pct >= 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Bottom Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-2xl p-5 pb-8 flex flex-col"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {/* Drag Handle */}
            <div className="flex justify-center -mt-1 mb-3">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>

            {/* Header: Stock info + Close button */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <CompanyLogo
                  ticker={stock.ticker}
                  size={46}
                  className="rounded-xl shrink-0 bg-slate-100 dark:bg-slate-800"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      {stock.ticker}
                    </span>
                    {stock.overallScore != null && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Score {stock.overallScore}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                    {stock.companyName || getCompanyName(stock.ticker)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                    ${formatPrice(price)}
                  </div>
                  <div className={`text-xs font-semibold tabular-nums ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatPercent(pct)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-1"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="py-4 space-y-5">
              {/* 1. Quantity / Shares Stepper */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="portfolio-shares-input" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Number of Shares
                  </label>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {quantity} {quantity === 1 ? 'share' : 'shares'}
                  </span>
                </div>

                {/* Stepper Controls */}
                <div className="grid grid-cols-5 gap-2 items-center">
                  <button
                    type="button"
                    onClick={() => applyQuantity(Math.max(0, quantity - 10))}
                    className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center"
                    title="Minus 10 shares"
                  >
                    -10
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuantity(Math.max(0, quantity - 1))}
                    className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-base hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center"
                    title="Minus 1 share"
                  >
                    <Minus size={18} />
                  </button>

                  <div className="relative">
                    <input
                      id="portfolio-shares-input"
                      type="text"
                      inputMode="decimal"
                      value={quantityStr}
                      onChange={handleQuantityInputChange}
                      placeholder="0"
                      className="w-full h-12 text-center text-lg font-extrabold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => applyQuantity(quantity + 1)}
                    className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-base hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center"
                    title="Plus 1 share"
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuantity(quantity + 10)}
                    className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center"
                    title="Plus 10 shares"
                  >
                    +10
                  </button>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-none">
                  <span className="text-[11px] text-slate-400 shrink-0 mr-1">Presets:</span>
                  {[1, 5, 10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => applyQuantity(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums transition-colors shrink-0 ${
                        quantity === preset
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                  {quantity > 0 && (
                    <button
                      type="button"
                      onClick={() => applyQuantity(0)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors shrink-0 ml-auto"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Average Buy Price (Cost Basis) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="portfolio-cost-basis-input" className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Average Buy Price (Cost Basis)
                  </label>
                  <span className="text-[11px] text-slate-400">Optional · For Total Return</span>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">
                    $
                  </span>
                  <input
                    id="portfolio-cost-basis-input"
                    type="text"
                    inputMode="decimal"
                    value={costBasisStr}
                    onChange={handleCostInputChange}
                    placeholder={`e.g. ${formatPrice(price)}`}
                    className="w-full h-12 pl-8 pr-28 text-base font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
                  />

                  {price > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCostBasis(price);
                        setCostBasisStr(String(price));
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 transition-colors flex items-center gap-1"
                      title="Use current market price as buy price"
                    >
                      <Zap size={12} />
                      Current (${formatPrice(price)})
                    </button>
                  )}
                </div>
              </div>

              {/* 3. Live Position Preview Card */}
              <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 p-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  Position Preview
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Position Value</div>
                    <div className="text-lg font-extrabold text-slate-900 dark:text-white tabular-nums">
                      ${formatPrice(positionValue)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Daily Gain / Loss</div>
                    <div className={`text-lg font-extrabold tabular-nums ${dailyPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {formatCurrencyCompact(dailyPnl, true)}
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Portfolio Weight</div>
                    <div className="text-sm font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                      {totalPortfolioValue > 0 ? ((positionValue / totalPortfolioValue) * 100).toFixed(1) : '0.0'}%
                    </div>
                  </div>

                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Total Return</div>
                    {totalPnl !== null ? (
                      <div className={`text-sm font-bold tabular-nums ${totalPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatCurrencyCompact(totalPnl, true)} ({totalRetPct !== null && totalRetPct >= 0 ? '+' : ''}{(totalRetPct ?? 0).toFixed(1)}%)
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 dark:text-slate-500 italic">
                        Set buy price above
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-2 space-y-2.5">
              <button
                type="button"
                onClick={handleSave}
                className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
              >
                <Check size={18} />
                Save Position
              </button>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleViewAnalysis}
                  className="flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ArrowUpRight size={14} />
                  View Full Analysis
                </button>

                <button
                  type="button"
                  onClick={handleDelete}
                  className={`py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                    confirmDelete
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
                  }`}
                >
                  <Trash2 size={14} />
                  {confirmDelete ? 'Confirm Remove?' : 'Remove'}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
