import Link from 'next/link';
import { formatPrice, formatPercent, formatMarketCap } from '@/lib/utils/format';
import { AddToWatchlist } from '@/components/company/AddToWatchlist';

interface AnalysisHeroProps {
  ticker: string;
  companyName: string;
  price: number | null;
  /** Live % change (meaningful only while a session is open) */
  changePct: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  /** 'closed' = weekend/holiday — live changePct is a frozen 0.00 in that case */
  marketSession: 'pre' | 'live' | 'after' | 'closed';
  /** Close of the session before the last one — used to compute the last real move when closed */
  prevClose: number | null;
  /** Last ~30 regular-session closes, oldest → newest (for the sparkline) */
  sparkline: number[];
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = h - 3 - ((p - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = points[points.length - 1]! >= points[0]!;
  const stroke = up ? '#059669' : '#e11d48';

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="inline-block"
      role="img"
      aria-label={`30-day price trend, ${up ? 'up' : 'down'}`}
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AnalysisHero({
  ticker,
  companyName,
  price,
  changePct,
  marketCap,
  sector,
  industry,
  marketSession,
  prevClose,
  sparkline,
}: AnalysisHeroProps) {
  const isClosed = marketSession === 'closed';

  // When the market is closed the API freezes changePct at 0.00 — compute the
  // last session's real move from the previous close instead. Without a
  // prevClose there is NO honest number to show (the frozen 0.00 would lie).
  const lastSessionPct =
    isClosed && price != null && price > 0 && prevClose != null && prevClose > 0
      ? (price / prevClose - 1) * 100
      : null;
  const displayPct = isClosed ? lastSessionPct : changePct;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {companyName} ({ticker}) Stock Analysis
          </h1>
          <AddToWatchlist ticker={ticker} />
        </div>
        {sparkline.length >= 2 && (
          <div className="flex items-center gap-2" title="Last 30 trading days (regular session)">
            <Sparkline points={sparkline} />
            <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              30d
            </span>
          </div>
        )}
      </div>
      {/* Price line — separate row */}
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-1">
        {price != null && (
          <>
            Price: ${formatPrice(price)}
          </>
        )}
        {isClosed && (
          <span
            className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            title="Market is closed — showing the last completed session"
          >
            Market Closed
          </span>
        )}
        {displayPct != null && (
          <>
            {' · '}
            <span
              className={
                displayPct > 0
                  ? 'text-green-600 dark:text-green-400'
                  : displayPct < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-500 dark:text-gray-400'
              }
            >
              {formatPercent(displayPct)}
              {isClosed && <span className="text-gray-400 dark:text-gray-500"> at last close</span>}
            </span>
          </>
        )}
      </p>
      {/* Sector + Industry — separate line */}
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {sector && (
          <>
            Sector:{' '}
            <Link
              href={`/sectors/${encodeURIComponent(sector)}`}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              {sector}
            </Link>
          </>
        )}
        {industry && <> · Industry: {industry}</>}
      </p>
    </div>
  );
}
