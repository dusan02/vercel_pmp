import Link from 'next/link';
import { formatPercent } from '@/lib/utils/heatmapFormat';
import type { EarningsSSRRow } from '@/lib/seo/earningsSSR';

// Shared presentational helpers for /earnings pages (server components).
// The two pages previously duplicated formatEps/formatRevenue/timeLabel —
// new enriched UI lives here so both pages share it.

export function formatEps(value: number | null): string {
  if (value == null) return '-';
  return `$${value.toFixed(2)}`;
}

export function formatRevenue(value: number | null): string {
  if (value == null) return '-';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toFixed(0)}`;
}

export function formatMcap(value: number | null): string {
  if (value == null) return '';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${(value / 1e3).toFixed(0)}K`;
}

export function timeLabel(time: string): string {
  switch (time) {
    case 'bmo': return 'Pre-Market';
    case 'amc': return 'After-Hours';
    case 'dmt': return 'During Market';
    default: return 'TBD';
  }
}

export function timeColor(time: string): string {
  switch (time) {
    case 'bmo': return 'text-yellow-600 dark:text-yellow-400';
    case 'amc': return 'text-purple-600 dark:text-purple-400';
    default: return 'text-gray-500';
  }
}

/** Compact pillar strip — same V/G/P/H/Q convention as Movers. */
export function PillarStrip({ row }: { row: EarningsSSRRow }) {
  const parts: [string, number | null][] = [
    ['V', row.valuationScore], ['G', row.growthScore], ['P', row.profitabilityScore],
    ['H', row.healthScore], ['Q', row.qualityScore],
  ];
  const filled = parts.filter(([, v]) => v !== null);
  if (filled.length === 0 && row.ewScore === null) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
      <span className="font-semibold uppercase tracking-wide text-slate-400">PMP</span>
      {filled.map(([l, v]) => (
        <span key={l} className="font-medium">{l} {Math.round(v!)}</span>
      ))}
      {row.ewScore !== null && (
        <span className="font-semibold text-indigo-500">
          EW {row.ewScore}{row.ewMaxPossible !== null && row.ewMaxPossible !== 100 ? `/${row.ewMaxPossible}` : ''}
        </span>
      )}
    </div>
  );
}

/** One-line factual "why watch" — sector + size + standout pillars + vol proxy. */
export function whyWatch(row: EarningsSSRRow): string {
  const bits: string[] = [];
  if (row.sector) bits.push(row.sector);
  if (row.marketCap !== null) bits.push(`${formatMcap(row.marketCap)} market cap`);
  const best = ([
    ['Quality', row.qualityScore], ['Profitability', row.profitabilityScore],
    ['Growth', row.growthScore], ['Health', row.healthScore],
  ] as [string, number | null][]).filter(([, v]) => v !== null && v >= 80)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
  if (best) bits.push(`strong ${best[0].toLowerCase()} (${Math.round(best[1]!)})`);
  if (row.stdDev20d !== null) bits.push(`typical daily move ±${row.stdDev20d.toFixed(1)}%`);
  return bits.join(' · ');
}

export function FeaturedEarningsCard({ row, eligible }: { row: EarningsSSRRow; eligible: Set<string> }) {
  const inner = (
    <div className="h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-bold text-slate-900 dark:text-white">{row.ticker}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{row.companyName}</div>
        </div>
        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${row.time === 'bmo' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400'}`}>
          {timeLabel(row.time)}
        </span>
      </div>
      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-0.5 tabular-nums">
        <div>EPS est. <span className="font-semibold">{formatEps(row.epsEstimate)}</span>
          {row.hasReported && row.epsActual !== null && (
            <> → <span className="font-semibold">{formatEps(row.epsActual)}</span>
              {row.epsSurprisePercent !== null && (
                <span className={row.epsSurprisePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {' '}({formatPercent(row.epsSurprisePercent)})
                </span>
              )}
            </>
          )}
        </div>
        <div>Rev est. <span className="font-semibold">{formatRevenue(row.revenueEstimate)}</span>
          {row.hasReported && row.revenueActual !== null && (
            <> → <span className="font-semibold">{formatRevenue(row.revenueActual)}</span>
              {row.revenueSurprisePercent !== null && (
                <span className={row.revenueSurprisePercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                  {' '}({formatPercent(row.revenueSurprisePercent)})
                </span>
              )}
            </>
          )}
        </div>
        {row.earningsDayMovePct !== null && (
          <div>Stock reaction:{' '}
            <span className={`font-semibold ${row.earningsDayMovePct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {formatPercent(row.earningsDayMovePct)}
            </span>
          </div>
        )}
      </div>
      <div className="mt-2"><PillarStrip row={row} /></div>
      {whyWatch(row) && (
        <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">{whyWatch(row)}</div>
      )}
    </div>
  );
  return eligible.has(row.ticker)
    ? <Link href={`/analysis/${row.ticker}`} className="block">{inner}</Link>
    : inner;
}
