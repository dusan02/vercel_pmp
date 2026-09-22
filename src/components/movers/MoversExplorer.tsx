'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import CompanyLogo from '@/components/CompanyLogo';
import { formatCompactNumber, formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { formatSectorName } from '@/lib/utils/format';
import { SIGMA_LABELS, type SigmaLevel } from '@/services/movers/classify';
import { isMicrocap } from '@/services/movers/liquidity';
import type { MoverRecord } from '@/services/movers/getMovers';
import { event } from '@/lib/ga';

// ─── Filters ────────────────────────────────────────────────────────────────
interface MoversFilters {
  minPct: number;
  minSigma: number;
  minRvol: number;
  catalyst: 'any' | 'confirmed' | 'earnings' | 'analyst' | 'none';
  minExcess: number;
  minQuality: number;
  showMicrocaps: boolean;
}

const DEFAULT_FILTERS: MoversFilters = {
  minPct: 0,
  minSigma: 0,
  minRvol: 0,
  catalyst: 'any',
  minExcess: 0,
  minQuality: 0,
  showMicrocaps: false,
};

const CATALYST_OPTIONS: { value: MoversFilters['catalyst']; label: string }[] = [
  { value: 'any', label: 'Any catalyst' },
  { value: 'confirmed', label: 'Confirmed only' },
  { value: 'earnings', label: 'Earnings' },
  { value: 'analyst', label: 'Analyst action' },
  { value: 'none', label: 'No catalyst' },
];

const EARNINGS_TYPES = new Set(['earnings_beat', 'earnings_miss', 'earnings_mixed', 'earnings_release']);
const ANALYST_TYPES = new Set(['analyst_upgrade', 'analyst_downgrade', 'analyst_action']);

function matchesFilters(m: MoverRecord, f: MoversFilters): boolean {
  if (!f.showMicrocaps && isMicrocap(m)) return false;
  if (f.minPct > 0 && Math.abs(m.lastChangePct ?? 0) < f.minPct) return false;
  if (f.minSigma > 0 && Math.abs(m.latestMoversZScore ?? 0) < f.minSigma) return false;
  if (f.minRvol > 0 && (m.latestMoversRVOL ?? 0) < f.minRvol) return false;
  if (f.minExcess > 0 && Math.abs(m.analysis?.excessMovePct ?? 0) < f.minExcess) return false;
  if (f.minQuality > 0 && (m.analysis?.pillars?.quality ?? 0) < f.minQuality) return false;
  if (f.catalyst !== 'any') {
    const c = m.analysis?.catalyst;
    if (f.catalyst === 'confirmed' && !(c?.status === 'found' && c.confidence === 'high')) return false;
    if (f.catalyst === 'earnings' && !EARNINGS_TYPES.has(c?.type ?? '')) return false;
    if (f.catalyst === 'analyst' && !ANALYST_TYPES.has(c?.type ?? '')) return false;
    if (f.catalyst === 'none' && c?.status === 'found') return false;
  }
  return true;
}

// ─── Standout superlatives ──────────────────────────────────────────────────
// Each card answers a different "why is this interesting" — distinct symbols
// preferred so the strip shows variety, not one ticker four times.
interface Standout {
  emoji: string;
  label: string;
  stat: string;
  mover: MoverRecord;
}

function computeStandouts(movers: MoverRecord[]): Standout[] {
  const liquid = movers.filter(m => !isMicrocap(m));
  const used = new Set<string>();
  const pick = (sorted: MoverRecord[]): MoverRecord | undefined =>
    sorted.find(m => !used.has(m.symbol)) ?? sorted[0];

  const byAbsMove = [...liquid].sort((a, b) => Math.abs(b.lastChangePct ?? 0) - Math.abs(a.lastChangePct ?? 0));
  const bySigma = [...liquid].filter(m => m.latestMoversZScore !== null).sort((a, b) => Math.abs(b.latestMoversZScore!) - Math.abs(a.latestMoversZScore!));
  const byRvol = [...liquid].filter(m => (m.latestMoversRVOL ?? 0) >= 1.5).sort((a, b) => (b.latestMoversRVOL ?? 0) - (a.latestMoversRVOL ?? 0));
  const byExcess = [...liquid].filter(m => m.analysis?.excessMovePct !== null && m.analysis?.excessMovePct !== undefined)
    .sort((a, b) => Math.abs(b.analysis!.excessMovePct!) - Math.abs(a.analysis!.excessMovePct!));

  const out: Standout[] = [];
  const add = (emoji: string, label: string, stat: (m: MoverRecord) => string, sorted: MoverRecord[]) => {
    const m = pick(sorted);
    if (!m) return;
    used.add(m.symbol);
    out.push({ emoji, label, stat: stat(m), mover: m });
  };

  add('🔥', 'Largest move', m => formatPercent(Math.abs(m.lastChangePct ?? 0)), byAbsMove);
  add('📊', 'Most unusual', m => `${Math.abs(m.latestMoversZScore!).toFixed(1)}σ`, bySigma);
  add('📈', 'Highest RVOL', m => `${(m.latestMoversRVOL ?? 0).toFixed(1)}× vol`, byRvol);
  add('⚡', 'Biggest vs sector', m => `${(m.analysis!.excessMovePct!) >= 0 ? '+' : ''}${m.analysis!.excessMovePct!.toFixed(1)}% excess`, byExcess);
  return out;
}

// ─── Cell renderers ─────────────────────────────────────────────────────────
const SIGMA_BADGE: Record<SigmaLevel, string> = {
  extreme: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  very_unusual: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  unusual: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  normal: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: 'bg-emerald-500',
  medium: 'bg-amber-500',
  low: 'bg-slate-400',
};

// Catalyst type → badge styling. Found catalysts get a colored chip so they
// pop; "no catalyst" is deliberately muted/dashed — absence of a catalyst is
// itself a signal worth scanning for.
const CATALYST_BADGE = {
  earnings: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  analyst: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  guidance: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
  corporate: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  flow: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
};

function catalystBadgeClass(type: string): string {
  if (type.startsWith('earnings')) return CATALYST_BADGE.earnings;
  if (type.startsWith('analyst')) return CATALYST_BADGE.analyst;
  if (type.startsWith('guidance')) return CATALYST_BADGE.guidance;
  if (['acquisition', 'partnership', 'contract', 'product', 'financing', 'restructuring', 'management', 'legal'].includes(type))
    return CATALYST_BADGE.corporate;
  if (['sector_move', 'market_move', 'unusual_volume'].includes(type)) return CATALYST_BADGE.flow;
  return 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/30';
}

function CatalystCell({ mover }: { mover: MoverRecord }) {
  const a = mover.analysis;
  if (!a) {
    return mover.moversReason ? (
      <div className="text-xs text-slate-600 dark:text-slate-400">
        <span className="font-bold opacity-50 mr-1">{mover.moversCategory}:</span>
        {mover.moversReason}
      </div>
    ) : (
      <span className="text-xs text-slate-400 italic">Analyzing…</span>
    );
  }
  const c = a.catalyst;
  const ev = c.evidence.find(e => e.url);
  return (
    <div className="text-xs">
      <div className="flex items-center gap-1.5">
        {c.status === 'found' ? (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${catalystBadgeClass(c.type)}`}
            title={c.explanation || c.label}
          >
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${CONFIDENCE_DOT[c.confidence]}`} title={`${c.confidence} confidence`} />
            {c.label}
          </span>
        ) : c.status === 'unavailable' ? (
          <span className="inline-block px-1.5 py-0.5 rounded border border-slate-300/60 dark:border-slate-600/60 text-[10px] text-slate-400 dark:text-slate-500">
            Catalyst data unavailable
          </span>
        ) : (
          <span
            className="inline-block px-1.5 py-0.5 rounded border border-dashed border-slate-400/60 dark:border-slate-500/60 text-[10px] font-medium text-slate-400 dark:text-slate-500"
            title="No obvious catalyst in Finnhub news, analyst actions, or earnings data — move may be flow-driven"
          >
            No catalyst found
          </span>
        )}
        {ev?.url && (
          <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline shrink-0 text-[10px]">[src]</a>
        )}
      </div>
      {(a.sectorChangePct !== null || a.marketChangePct !== null) && (
        <div className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
          {a.sectorChangePct !== null && `Sector ${a.sectorChangePct >= 0 ? '+' : ''}${a.sectorChangePct.toFixed(1)}%`}
          {a.sectorChangePct !== null && a.marketChangePct !== null && ' · '}
          {a.marketChangePct !== null && `Mkt ${a.marketChangePct >= 0 ? '+' : ''}${a.marketChangePct.toFixed(1)}%`}
          {a.excessMovePct !== null && ` · Excess ${a.excessMovePct >= 0 ? '+' : ''}${a.excessMovePct.toFixed(1)}%`}
        </div>
      )}
    </div>
  );
}

function PillarDetail({ mover }: { mover: MoverRecord }) {
  const p = mover.analysis?.pillars;
  if (!p) return <span className="text-xs text-slate-400 italic">No quality scores available</span>;
  const cell = (name: string, v: number | null) =>
    v === null ? null : (
      <span key={name} className="tabular-nums">
        <span className="text-slate-400">{name}</span>{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.round(v)}</span>
      </span>
    );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {cell('Valuation', p.valuation)}{cell('Growth', p.growth)}{cell('Profitability', p.profitability)}{cell('Health', p.health)}{cell('Quality', p.quality)}
      {p.ewScore !== null && p.ewMaxPossible !== null && (
        <span className="tabular-nums" title="Early Winners composite score (V5-B, current data)">
          <span className="text-slate-400">EW Score</span>{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-300">{Math.round(p.ewScore)}/{Math.round(p.ewMaxPossible)}</span>
        </span>
      )}
      <Link href={`/analysis/${mover.symbol}`} className="ml-auto text-blue-500 hover:underline">
        Full analysis →
      </Link>
    </div>
  );
}

function MoversTable({ title, rows, eligibleAnalysis }: { title: string; rows: MoverRecord[]; eligibleAnalysis: Set<string> }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (sym: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(sym)) next.delete(sym); else next.add(sym);
      return next;
    });

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-slate-600 dark:text-slate-400">
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2 text-right">Move</th>
              <th className="px-3 py-2 text-center" title="σ (z-score) — how unusual today's move is relative to this stock's own volatility. A +9% move can be 'Normal' for a high-volatility stock.">σ</th>
              <th className="px-3 py-2">Catalyst</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pct = r.lastChangePct ?? 0;
              const color =
                pct > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : pct < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400';

              const sector = r.sector || 'Other';
              const sectorHref = `/sectors/${encodeURIComponent(sector)}`;
              const sigma = r.analysis?.sigmaLevel ?? 'normal';
              const z = r.latestMoversZScore;
              const rvol = r.latestMoversRVOL;

              return (
                <React.Fragment key={r.symbol}>
                <tr
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60 align-top"
                >
                  {/* Stock: logo + ticker + company + sector stacked */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                      <CompanyLogo ticker={r.symbol} size={22} className="rounded" />
                      {eligibleAnalysis.has(r.symbol) ? (
                        <Link className="hover:underline" href={`/analysis/${r.symbol}`}>
                          {r.symbol}
                        </Link>
                      ) : (
                        r.symbol
                      )}
                    </div>
                    {r.name && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 max-w-[130px] truncate" title={r.name}>
                        {r.name}
                      </div>
                    )}
                    <Link
                      className="block text-[10px] text-slate-400 dark:text-slate-500 hover:underline leading-tight mt-0.5"
                      href={sectorHref}
                    >
                      {formatSectorName(sector)}
                    </Link>
                  </td>
                  {/* Move: % change dominant, price + volume/RVOL underneath */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className={`tabular-nums font-bold text-base leading-tight ${color}`}>
                      {formatPercent(pct)}
                    </div>
                    <div className="tabular-nums text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                      {formatPrice(r.lastPrice)}
                    </div>
                    <div className="tabular-nums text-[10px] text-slate-400 leading-tight mt-0.5">
                      {r.lastVolume && r.lastVolume > 0 ? `${formatCompactNumber(r.lastVolume)} vol` : ''}
                      {rvol != null && rvol >= 1.5 && (
                        <span className={`ml-1 font-semibold ${rvol >= 5 ? 'text-blue-600 dark:text-blue-400' : 'text-blue-500/80 dark:text-blue-400/80'}`} title={`Relative volume ${rvol.toFixed(1)}× normal`}>
                          {rvol.toFixed(1)}×
                        </span>
                      )}
                    </div>
                  </td>
                  {/* σ: badge + plain-language tier */}
                  <td className="px-3 py-2.5 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${SIGMA_BADGE[sigma]}`}
                      title={`σ (z-score) ${z?.toFixed(1) ?? '—'} — today's move is ${Math.abs(z ?? 0).toFixed(1)} standard deviations from this stock's typical daily move. It measures unusualness relative to the stock's own volatility, so a big % move can still be 'Normal' for a volatile stock.`}
                    >
                      {z !== null ? `${Math.abs(z).toFixed(1)}σ` : '—'}
                    </span>
                    <div className="text-[9px] text-slate-400 dark:text-slate-500 leading-tight mt-0.5">
                      {SIGMA_LABELS[sigma]}
                    </div>
                  </td>
                  {/* Catalyst */}
                  <td className="px-3 py-2.5">
                    <CatalystCell mover={r} />
                  </td>
                  {/* Expand quality scores */}
                  <td className="pr-2 py-2.5 align-top">
                    <button
                      onClick={() => toggle(r.symbol)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xs px-1"
                      title={expanded.has(r.symbol) ? 'Hide quality scores' : 'Show quality scores (V/G/P/H/Q/EW)'}
                      aria-expanded={expanded.has(r.symbol)}
                    >
                      {expanded.has(r.symbol) ? '▾' : '▸'}
                    </button>
                  </td>
                </tr>
                {expanded.has(r.symbol) && (
                  <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60">
                    <td colSpan={5} className="px-4 py-2.5">
                      <PillarDetail mover={r} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Standout strip ─────────────────────────────────────────────────────────
function StandoutCard({ s }: { s: Standout }) {
  const { mover } = s;
  const pct = mover.lastChangePct ?? 0;
  const color = pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
  const catalystLabel = mover.analysis?.catalyst.status === 'found' ? mover.analysis.catalyst.label : null;

  return (
    <Link
      href={`/analysis/${mover.symbol}`}
      className="flex-1 min-w-[170px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition-all"
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {s.emoji} {s.label}
      </div>
      <div className="flex items-center gap-1.5 mt-1">
        <CompanyLogo ticker={mover.symbol} size={18} className="rounded" />
        <span className="font-bold text-sm text-slate-900 dark:text-slate-100">{mover.symbol}</span>
        <span className={`ml-auto tabular-nums font-bold text-sm ${color}`}>{formatPercent(pct)}</span>
      </div>
      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums mt-0.5">
        {s.stat}
      </div>
      {catalystLabel && (
        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" title={catalystLabel}>
          {catalystLabel}
        </div>
      )}
    </Link>
  );
}

// ─── Explorer ───────────────────────────────────────────────────────────────
interface MoversExplorerProps {
  gainers: MoverRecord[];
  losers: MoverRecord[];
  eligibleSymbols: string[];
}

type MoversView = 'gainers' | 'losers' | 'active';

export function MoversExplorer({ gainers, losers, eligibleSymbols }: MoversExplorerProps) {
  const [filters, setFilters] = useState<MoversFilters>(DEFAULT_FILTERS);
  const [view, setView] = useState<MoversView>('gainers');
  const eligibleAnalysis = useMemo(() => new Set(eligibleSymbols), [eligibleSymbols]);

  const allMovers = useMemo(() => [...gainers, ...losers], [gainers, losers]);

  const standouts = useMemo(() => computeStandouts(allMovers), [allMovers]);

  const filteredGainers = useMemo(() => gainers.filter(m => matchesFilters(m, filters)), [gainers, filters]);
  const filteredLosers = useMemo(() => losers.filter(m => matchesFilters(m, filters)), [losers, filters]);
  const mostActive = useMemo(() =>
    [...filteredGainers, ...filteredLosers]
      .sort((a, b) => ((b.lastVolume ?? 0) * (b.lastPrice ?? 0)) - ((a.lastVolume ?? 0) * (a.lastPrice ?? 0)))
      .slice(0, 25),
    [filteredGainers, filteredLosers]);
  const hiddenMicrocaps = useMemo(
    () => (filters.showMicrocaps ? 0 : allMovers.filter(m => isMicrocap(m) && matchesFilters(m, { ...filters, showMicrocaps: true })).length),
    [allMovers, filters]);

  const filtersActive = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const set = <K extends keyof MoversFilters>(k: K, v: MoversFilters[K]) => {
    setFilters(prev => ({ ...prev, [k]: v }));
    event('movers_filter', { filter_key: k, filter_value: String(v) });
  };

  const inputCls = 'w-16 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 tabular-nums';

  return (
    <div>
      {/* Standout movers — each card answers a different "why interesting" */}
      {standouts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide mb-2">Today's standout movers</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {standouts.map(s => <StandoutCard key={s.label} s={s} />)}
          </div>
        </section>
      )}

      {/* Combinable filters — turns the list into a mini research tool */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filters</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          |%| ≥
          <input type="number" min="0" step="1" className={inputCls} value={filters.minPct || ''} placeholder="0"
            onChange={e => set('minPct', parseFloat(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          σ ≥
          <input type="number" min="0" step="0.5" className={inputCls} value={filters.minSigma || ''} placeholder="0"
            onChange={e => set('minSigma', parseFloat(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          RVOL ≥
          <input type="number" min="0" step="0.5" className={inputCls} value={filters.minRvol || ''} placeholder="0"
            onChange={e => set('minRvol', parseFloat(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          Excess ≥
          <input type="number" min="0" step="1" className={inputCls} value={filters.minExcess || ''} placeholder="0"
            onChange={e => set('minExcess', parseFloat(e.target.value) || 0)} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          Quality ≥
          <input type="number" min="0" max="100" step="5" className={inputCls} value={filters.minQuality || ''} placeholder="0"
            onChange={e => set('minQuality', parseFloat(e.target.value) || 0)} />
        </label>
        <select
          className="px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300"
          value={filters.catalyst}
          onChange={e => set('catalyst', e.target.value as MoversFilters['catalyst'])}
        >
          {CATALYST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer" title="Show stocks priced under $5 or under $1M dollar volume">
          <input type="checkbox" checked={filters.showMicrocaps} onChange={e => set('showMicrocaps', e.target.checked)} className="rounded" />
          Microcaps
        </label>
        <span className="ml-auto text-xs font-semibold text-slate-600 dark:text-slate-400 tabular-nums">
          {filteredGainers.length + filteredLosers.length} mover{filteredGainers.length + filteredLosers.length !== 1 ? 's' : ''} match{filtersActive ? ' your filters' : ''}
        </span>
        {filtersActive && (
          <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs text-blue-500 hover:underline">
            Reset
          </button>
        )}
      </div>

      {/* View tabs — all three tables stay in the DOM (SEO links intact),
          only the active one is visible */}
      <div className="flex gap-1.5 mb-3">
        {([
          ['gainers', `Gainers ${filteredGainers.length}`],
          ['losers', `Losers ${filteredLosers.length}`],
          ['active', `Most Active ${mostActive.length}`],
        ] as [MoversView, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setView(key); event('movers_view', { view: key }); }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${view === key
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400 dark:bg-transparent dark:text-slate-400 dark:border-white/10'
              }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={view === 'gainers' ? '' : 'hidden'}>
        <MoversTable title="Top Gainers" rows={filteredGainers} eligibleAnalysis={eligibleAnalysis} />
      </div>
      <div className={view === 'losers' ? '' : 'hidden'}>
        <MoversTable title="Top Losers" rows={filteredLosers} eligibleAnalysis={eligibleAnalysis} />
      </div>
      <div className={view === 'active' ? '' : 'hidden'}>
        <MoversTable title="Most Active" rows={mostActive} eligibleAnalysis={eligibleAnalysis} />
      </div>

      {hiddenMicrocaps > 0 && (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          {hiddenMicrocaps} microcap mover{hiddenMicrocaps !== 1 ? 's' : ''} hidden (&lt;$5 or &lt;$1M volume) — enable “Microcaps” above to include them.
        </p>
      )}
    </div>
  );
}
