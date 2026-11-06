'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { DipIdeaItem } from '@/lib/tradingIdeas/dipEngine';
import { calculateWeightedTranches } from '@/lib/tradingIdeas/dipClientMath';
import { Calculator, RotateCcw, ShieldAlert, Coins, ArrowUpRight } from 'lucide-react';

interface TrancheCalculatorWidgetProps {
  item: DipIdeaItem;
  defaultCapitalUsd?: number;
}

const CAPITAL_PRESETS = [5100, 10000, 15300, 18200, 25000, 50000];

export function TrancheCalculatorWidget({
  item,
  defaultCapitalUsd = 15300,
}: TrancheCalculatorWidgetProps) {
  const hasSlave = Boolean(item.pair.slaveSymbol && item.slaveQuote);
  const [useSlave, setUseSlave] = useState<boolean>(hasSlave);
  const [capitalUsd, setCapitalUsd] = useState<number>(defaultCapitalUsd);

  const activePlan = useMemo(
    () => (useSlave && hasSlave ? item.tranchePlanSlave : item.tranchePlanMaster),
    [useSlave, hasSlave, item.tranchePlanSlave, item.tranchePlanMaster]
  );

  const [targetPrice, setTargetPrice] = useState<number>(activePlan.suggestedTargetPrice);
  const [customEntries, setCustomEntries] = useState<[number, number, number]>([
    activePlan.levels[0].slaveEntryPrice,
    activePlan.levels[1].slaveEntryPrice,
    activePlan.levels[2].slaveEntryPrice,
  ]);

  // Sync default prices when switching ticker or Master/Slave mode
  useEffect(() => {
    setUseSlave(Boolean(item.pair.slaveSymbol && item.slaveQuote));
  }, [item.id, item.pair.slaveSymbol, item.slaveQuote]);

  useEffect(() => {
    setTargetPrice(activePlan.suggestedTargetPrice);
    setCustomEntries([
      activePlan.levels[0].slaveEntryPrice,
      activePlan.levels[1].slaveEntryPrice,
      activePlan.levels[2].slaveEntryPrice,
    ]);
  }, [activePlan]);

  const resetToModelPrices = () => {
    setTargetPrice(activePlan.suggestedTargetPrice);
    setCustomEntries([
      activePlan.levels[0].slaveEntryPrice,
      activePlan.levels[1].slaveEntryPrice,
      activePlan.levels[2].slaveEntryPrice,
    ]);
  };

  const calc = useMemo(
    () =>
      calculateWeightedTranches({
        capitalUsd,
        targetPrice,
        levels: activePlan.levels,
        customEntryPrices: customEntries,
        taxRatePct: 15,
      }),
    [capitalUsd, targetPrice, activePlan.levels, customEntries]
  );

  const fullPositionRow = calc.rows[2]!;
  const compressionPct =
    customEntries[0] > 0 && calc.finalWeightedAvgPrice > 0
      ? (((calc.finalWeightedAvgPrice / customEntries[0]) - 1) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
      {/* Header & Master/Slave Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Calculator size={18} className="text-blue-600 dark:text-blue-400 shrink-0" />
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              Weighted 3-Tranche Pyramid Calculator (28% : 28% : 44%)
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Heaviest weight (44%) goes into Tranche 3 at the 200W SMA touch for maximum harmonic mean cost-basis compression.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasSlave && (
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setUseSlave(true)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  useSlave
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Leveraged ETF: {item.pair.slaveSymbol} ({item.pair.leverage}×)
              </button>
              <button
                type="button"
                onClick={() => setUseSlave(false)}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  !useSlave
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Underlying: {item.pair.masterSymbol} (1×)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={resetToModelPrices}
            title="Reset to model tranche prices"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset Model</span>
          </button>
        </div>
      </div>

      {/* Inputs: Total Capital & Target Exit Price */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200/70 dark:border-slate-800">
        {/* Capital Input */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Total Trade Capital (USD)
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
              <input
                type="number"
                min={500}
                step={100}
                value={capitalUsd}
                onChange={(e) => setCapitalUsd(Math.max(100, Number(e.target.value) || 0))}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CAPITAL_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCapitalUsd(preset)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums transition-colors ${
                  capitalUsd === preset
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-400'
                }`}
              >
                ${preset.toLocaleString('en-US')}
              </button>
            ))}
          </div>
        </div>

        {/* Target Exit Price Input */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Target Exit Price ({activePlan.instrumentSymbol}) · Current ${activePlan.currentInstrumentPrice.toFixed(2)}
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={targetPrice}
                onChange={(e) => setTargetPrice(Math.max(0.1, Number(e.target.value) || 0))}
                className="w-full pl-7 pr-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { label: `Model SMA50 ($${activePlan.suggestedTargetPrice})`, val: activePlan.suggestedTargetPrice },
              {
                label: '+20% vs T1',
                val: Number((customEntries[0] * 1.2).toFixed(2)),
              },
              {
                label: '+35% vs T1',
                val: Number((customEntries[0] * 1.35).toFixed(2)),
              },
              {
                label: '+50% vs T1',
                val: Number((customEntries[0] * 1.5).toFixed(2)),
              },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={() => setTargetPrice(b.val)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums transition-colors ${
                  Math.abs(targetPrice - b.val) < 0.05
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tranche Pyramid Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <th className="py-2.5 px-3 font-bold">Tranche &amp; Weight</th>
              <th className="py-2.5 px-3 font-bold">Underlying Trigger ({item.pair.masterSymbol})</th>
              <th className="py-2.5 px-3 font-bold text-right">Entry Price ({activePlan.instrumentSymbol})</th>
              <th className="py-2.5 px-3 font-bold text-right">Allocation / Shares</th>
              <th className="py-2.5 px-3 font-bold text-right">New Avg Cost (Position)</th>
              <th className="py-2.5 px-3 font-bold text-right">Net Profit (After 15% Tax)</th>
              <th className="py-2.5 px-3 font-bold text-right">1Y Hold / Hedge (0% Tax)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {calc.rows.map((row, idx) => {
              const isWaveActive = item.semafor.activeWave === row.trancheNumber;
              return (
                <tr
                  key={row.trancheNumber}
                  className={
                    isWaveActive
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/25'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }
                >
                  <td className="py-3 px-3 align-top">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                      <span
                        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-extrabold ${
                          row.trancheNumber === 3
                            ? 'bg-emerald-600 text-white'
                            : row.trancheNumber === 2
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-blue-500/20 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {row.trancheNumber}.
                      </span>
                      <span>{row.weightPct}% Capital</span>
                      {isWaveActive && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-600 text-white">
                          ACTIVE WAVE
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Budget: ${row.allocatedCapitalUsd.toLocaleString('en-US')}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top max-w-xs">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.pair.masterSymbol} @ ${row.masterTriggerPrice.toFixed(2)}{' '}
                      <span className="text-rose-600 dark:text-rose-400 font-normal">
                        ({activePlan.levels[idx]!.masterDropFromCurrentPct >= 0 ? '+' : ''}
                        {activePlan.levels[idx]!.masterDropFromCurrentPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5">
                      {row.triggerConditionSk}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <span className="text-slate-400">$</span>
                      <input
                        type="number"
                        min={0.1}
                        step={0.25}
                        value={customEntries[idx]}
                        onChange={(e) => {
                          const val = Math.max(0.05, Number(e.target.value) || 0);
                          setCustomEntries((prev) => {
                            const next: [number, number, number] = [...prev];
                            next[idx] = val;
                            return next;
                          });
                        }}
                        className="w-20 px-2 py-1 text-right rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-white tabular-nums"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                      vs now:{' '}
                      {activePlan.currentInstrumentPrice > 0
                        ? `${(((customEntries[idx]! / activePlan.currentInstrumentPrice) - 1) * 100).toFixed(1)}%`
                        : '–'}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right tabular-nums">
                    <div className="font-bold text-slate-900 dark:text-white">
                      +{row.sharesBought.toLocaleString('en-US')} sh
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      ${row.actualInvestedUsd.toLocaleString('en-US')}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right tabular-nums">
                    <div className="font-extrabold text-blue-600 dark:text-blue-400 text-sm">
                      ${row.newWeightedAvgPrice.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Total: {row.cumulativeShares.toLocaleString('en-US')} sh (${row.cumulativeInvestedUsd.toLocaleString('en-US')})
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right tabular-nums">
                    <div
                      className={`font-bold text-sm ${
                        row.netProfitAfter15PctTaxUsd >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.netProfitAfter15PctTaxUsd >= 0 ? '+' : ''}$
                      {row.netProfitAfter15PctTaxUsd.toLocaleString('en-US')}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.netReturnAfter15PctTaxPct >= 0 ? '+' : ''}
                      {row.netReturnAfter15PctTaxPct.toFixed(1)}% net
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right tabular-nums">
                    <div
                      className={`font-bold text-sm ${
                        row.netProfitTaxFree1YUsd >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.netProfitTaxFree1YUsd >= 0 ? '+' : ''}$
                      {row.netProfitTaxFree1YUsd.toLocaleString('en-US')}
                    </div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                      Tax saved: +${row.taxSavedBy1YTestUsd.toLocaleString('en-US')}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary: Harmonic Mean Compression + Tax Hedge Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-900/50 p-3 flex items-start gap-2.5">
          <Coins size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-slate-900 dark:text-white">
              Harmonic Mean Effect (28 : 28 : 44 Weights)
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              If all 3 tranches fill, your weighted average cost basis compresses from{' '}
              <strong>${customEntries[0].toFixed(2)}</strong> down to{' '}
              <strong className="text-blue-600 dark:text-blue-400">
                ${calc.finalWeightedAvgPrice.toFixed(2)} ({compressionPct}%)
              </strong>
              . You do not need price to return to your initial entry — a bounce to{' '}
              <strong>${calc.finalWeightedAvgPrice.toFixed(2)}</strong> reaches full break-even.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/50 p-3 flex items-start gap-2.5">
          <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Tax Hedging (15% Tax vs. 1-Year Holding Test)</span>
              <ArrowUpRight size={13} className="text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              If Daily RSI spikes ≥ 78 at your <strong>${targetPrice.toFixed(2)}</strong> target before the 1-year tax exemption window,
              selling outright costs 15% tax (<strong>${fullPositionRow.taxSavedBy1YTestUsd.toLocaleString('en-US')}</strong>).
              Alternative: hold {activePlan.instrumentSymbol} until the 1Y mark and lock in gains via inverse ETF{' '}
              <strong>{activePlan.inverseEtfSymbol || 'SQQQ/SOXS'}</strong> (3× inverse capital required: ~
              <strong>${calc.hedgeSimulation.capitalNeededFor3xInverseUsd.toLocaleString('en-US')}</strong>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
