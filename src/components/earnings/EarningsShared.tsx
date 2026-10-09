import Link from 'next/link';
import { formatPercent } from '@/lib/utils/heatmapFormat';
import CompanyLogo from '@/components/CompanyLogo';
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

/** Signed dollar delta — marketCapDiff is an absolute $ value, NOT a percent. */
export function formatSignedMcap(value: number | null): string {
  if (value == null) return '';
  const sign = value >= 0 ? '+' : '-';
  const a = Math.abs(value);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(0)}M`;
  return `${sign}$${a.toFixed(0)}`;
}

export function capBadge(mcap: number | null): { label: string; cls: string } | null {
  if (mcap == null) return null;
  if (mcap >= 2e11) return { label: 'Mega', cls: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' };
  if (mcap >= 1e10) return { label: 'Large', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' };
  if (mcap >= 2e9) return { label: 'Mid', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' };
  return { label: 'Small', cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400' };
}

export function timeChip(t: string): { label: string; cls: string } {
  switch (t) {
    case 'bmo': return { label: 'Pre', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' };
    case 'amc': return { label: 'After', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' };
    default: return { label: 'TBD', cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' };
  }
}

const deltaColor = (v: number | null | undefined) =>
  v == null ? '' : v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';

/** Stacked metric cell (value / est-sub / colored delta) — earningstable.com convention. */
function MetricTd({ value, sub, delta, deltaText }: { value: string; sub?: string | undefined; delta?: number | null; deltaText?: string | undefined }) {
  const text = deltaText ?? (delta != null ? formatPercent(delta) : '');
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <div className="text-sm font-bold text-neutral-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] text-neutral-400 dark:text-neutral-500">{sub}</div>}
      {text && <div className={`text-xs font-semibold ${deltaColor(delta)}`}>{text}</div>}
    </td>
  );
}

function EarningsRow({ row, eligible }: { row: EarningsSSRRow; eligible: Set<string> }) {
  const badge = capBadge(row.marketCap);
  const chip = timeChip(row.time);
  const linked = eligible.has(row.ticker);

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-950/60">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <CompanyLogo ticker={row.ticker} size={28} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {linked ? (
                <Link href={`/analysis/${row.ticker}`} className="text-sm font-bold text-neutral-900 dark:text-white hover:underline">{row.ticker}</Link>
              ) : (
                <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{row.ticker}</span>
              )}
              {badge && <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${badge.cls}`}>{badge.label}</span>}
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md ${chip.cls}`}>{chip.label}</span>
            </div>
            {row.companyName && row.companyName.toUpperCase() !== row.ticker.toUpperCase() && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate max-w-[220px]">{row.companyName}</div>
            )}
          </div>
        </div>
      </td>
      <MetricTd
        value={formatMcap(row.marketCap) || '-'}
        delta={row.marketCapDiff}
        deltaText={row.marketCapDiff != null ? formatSignedMcap(row.marketCapDiff) : undefined}
      />
      <MetricTd
        value={row.price != null ? `$${row.price.toFixed(2)}` : '-'}
        delta={row.priceChangePct}
      />
      <MetricTd
        value={row.epsActual != null ? formatEps(row.epsActual) : '-'}
        sub={`Est: ${row.epsEstimate != null ? formatEps(row.epsEstimate) : '-'}`}
        delta={row.epsSurprisePercent}
      />
      <MetricTd
        value={row.revenueActual != null ? formatRevenue(row.revenueActual) : '-'}
        sub={`Est: ${row.revenueEstimate != null ? formatRevenue(row.revenueEstimate) : '-'}`}
        delta={row.revenueSurprisePercent}
      />
    </tr>
  );
}

/** Shared earnings table (ET-style: Company / Mkt Cap / Price / EPS / Revenue)
 *  used on /earnings and /earnings/date/[date]. */
export function EarningsTable({ rows, eligible }: { rows: EarningsSSRRow[]; eligible: Set<string> }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead className="bg-slate-50 dark:bg-slate-950">
            <tr className="text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <th className="px-3 py-3 text-left">Company</th>
              <th className="px-3 py-3 text-right">Mkt Cap</th>
              <th className="px-3 py-3 text-right">Price</th>
              <th className="px-3 py-3 text-right">EPS</th>
              <th className="px-3 py-3 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => <EarningsRow key={`${r.ticker}-${r.date}`} row={r} eligible={eligible} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
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
