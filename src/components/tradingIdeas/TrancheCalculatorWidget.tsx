'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { DipIdeaItem } from '@/lib/tradingIdeas/dipEngine';
import { calculateWeightedTranches } from '@/lib/tradingIdeas/dipEngine';
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
              Kalkulátor vážených tranží (Pyramída 28 % : 28 % : 44 %)
            </h4>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Najväčšia váha (44 %) ide na 3. tranžu pri dotyku 200W SMA pre maximálne stlačenie priemernej ceny cez harmonický priemer.
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
                Pákové ETF: {item.pair.slaveSymbol} ({item.pair.leverage}×)
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
                Podklad: {item.pair.masterSymbol} (1×)
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={resetToModelPrices}
            title="Obnoviť modelové ceny tranží"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset modelu</span>
          </button>
        </div>
      </div>

      {/* Inputs: Total Capital & Target Exit Price */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3 border border-slate-200/70 dark:border-slate-800">
        {/* Capital Input */}
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            Celkový voľný kapitál na obchod (USD)
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
            Cieľová predajná cena (Target pre {activePlan.instrumentSymbol}) · Aktuálne ${activePlan.currentInstrumentPrice.toFixed(2)}
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
                label: '+20 % od 1.T',
                val: Number((customEntries[0] * 1.2).toFixed(2)),
              },
              {
                label: '+35 % od 1.T',
                val: Number((customEntries[0] * 1.35).toFixed(2)),
              },
              {
                label: '+50 % od 1.T',
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
              <th className="py-2.5 px-3 font-bold">Tranža &amp; Váha</th>
              <th className="py-2.5 px-3 font-bold">Podmienka na podklade ({item.pair.masterSymbol})</th>
              <th className="py-2.5 px-3 font-bold text-right">Nákupná cena ({activePlan.instrumentSymbol})</th>
              <th className="py-2.5 px-3 font-bold text-right">Alokácia / Kusy</th>
              <th className="py-2.5 px-3 font-bold text-right">Nová priem. cena (Pozícia)</th>
              <th className="py-2.5 px-3 font-bold text-right">Čistý zisk (po 15 % dani)</th>
              <th className="py-2.5 px-3 font-bold text-right">Zisk 1Y Test (0 % daň)</th>
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
                      <span>{row.weightPct} % kapitálu</span>
                      {isWaveActive && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-600 text-white">
                          AKTÍVNA VLNA
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Plán: ${row.allocatedCapitalUsd.toLocaleString('en-US')}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top max-w-xs">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.pair.masterSymbol} @ ${row.masterTriggerPrice.toFixed(2)}{' '}
                      <span className="text-rose-600 dark:text-rose-400 font-normal">
                        ({activePlan.levels[idx]!.masterDropFromCurrentPct >= 0 ? '+' : ''}
                        {activePlan.levels[idx]!.masterDropFromCurrentPct.toFixed(1)} %)
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
                      vs dnes:{' '}
                      {activePlan.currentInstrumentPrice > 0
                        ? `${(((customEntries[idx]! / activePlan.currentInstrumentPrice) - 1) * 100).toFixed(1)} %`
                        : '–'}
                    </div>
                  </td>

                  <td className="py-3 px-3 align-top text-right tabular-nums">
                    <div className="font-bold text-slate-900 dark:text-white">
                      +{row.sharesBought.toLocaleString('en-US')} ks
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
                      Spolu: {row.cumulativeShares.toLocaleString('en-US')} ks (${row.cumulativeInvestedUsd.toLocaleString('en-US')})
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
                      {row.netReturnAfter15PctTaxPct.toFixed(1)} % netto
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
                      Úspora dane: +${row.taxSavedBy1YTestUsd.toLocaleString('en-US')}
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
              Efekt harmonického priemeru (Váhy 28 : 28 : 44)
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              Pri vyplnení všetkých 3 tranží sa tvoja priemerná nákupná cena stlačí z{' '}
              <strong>${customEntries[0].toFixed(2)}</strong> na{' '}
              <strong className="text-blue-600 dark:text-blue-400">
                ${calc.finalWeightedAvgPrice.toFixed(2)} ({compressionPct} %)
              </strong>
              . Na bodu zvratu (break-even) tak nepotrebuješ návrat na pôvodnú cenu, ale stačí odraz na{' '}
              <strong>${calc.finalWeightedAvgPrice.toFixed(2)}</strong>.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-900/50 p-3 flex items-start gap-2.5">
          <ShieldAlert size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>Daňový hedžing (15 % daň vs. 1-ročný časový test)</span>
              <ArrowUpRight size={13} className="text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
              Ak pri Targete <strong>${targetPrice.toFixed(2)}</strong> vyskočí Daily RSI ≥ 78 pred uplynutím 1 roka,
              priamym predajom by si zaplatil 15 % daň (<strong>${fullPositionRow.taxSavedBy1YTestUsd.toLocaleString('en-US')}</strong>).
              Alternatíva: podržať {activePlan.instrumentSymbol} do 1Y testu a zisk dočasne uzamknúť nákupom inverzného ETF{' '}
              <strong>{activePlan.inverseEtfSymbol || 'SQQQ/SOXS'}</strong> (potrebný hedžingový kapitál pri 3× inverznom ETF: ~
              <strong>${calc.hedgeSimulation.capitalNeededFor3xInverseUsd.toLocaleString('en-US')}</strong>).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
