import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { getEligibleValuationTickers } from '@/lib/seo/eligibleValuation';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';

interface MoverLink {
  symbol: string;
  name: string;
  sector: string | null;
  lastPrice: number | null;
  lastChangePct: number | null;
  lastMarketCap: number | null;
  hasValuation: boolean;
}

/**
 * Fetch top movers from DB (Ticker.lastChangePct).
 * This is independent of Redis and always available.
 * Used for SSR discovery sections on /gainers, /losers, /premarket-movers.
 */
async function getTopMoversFromDB(
  direction: 'gainers' | 'losers',
  limit: number = 25
): Promise<MoverLink[]> {
  const eligibleAnalysis = new Set(await getEligibleAnalysisTickers());
  const eligibleValuation = new Set(await getEligibleValuationTickers());

  const tickers = await prisma.ticker.findMany({
    where: {
      lastPrice: { gt: 0 },
      lastChangePct: direction === 'gainers' ? { gt: 0.01 } : { lt: -0.01 },
      symbol: { in: [...eligibleAnalysis] },
    },
    select: {
      symbol: true,
      name: true,
      sector: true,
      lastPrice: true,
      lastChangePct: true,
      lastMarketCap: true,
    },
    orderBy: { lastChangePct: direction === 'gainers' ? 'desc' : 'asc' },
    take: limit,
  });

  return tickers.map((t) => ({
    symbol: t.symbol,
    name: t.name || t.symbol,
    sector: t.sector,
    lastPrice: t.lastPrice,
    lastChangePct: t.lastChangePct,
    lastMarketCap: t.lastMarketCap,
    hasValuation: eligibleValuation.has(t.symbol),
  }));
}

function formatMarketCap(value: number | null): string {
  if (value == null || value <= 0) return '—';
  if (value >= 1000) return `$${(value / 1000).toFixed(2)}T`;
  if (value >= 1) return `$${value.toFixed(1)}B`;
  return `$${(value * 1000).toFixed(0)}M`;
}

/**
 * Server-rendered discovery section with ticker links.
 * Renders top movers from DB data, independent of Redis.
 * Each ticker links to /analysis/[ticker] and /valuation/[ticker] (if eligible).
 */
export async function SsrMoverLinks({
  direction,
  limit = 25,
  title,
}: {
  direction: 'gainers' | 'losers';
  limit?: number;
  title: string;
}) {
  const movers = await getTopMoversFromDB(direction, limit);

  if (movers.length === 0) {
    return null;
  }

  const isGainers = direction === 'gainers';
  const changeClass = isGainers
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';

  return (
    <section
      className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
      aria-label={title}
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {movers.map((m) => (
          <div
            key={m.symbol}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Link
                href={`/analysis/${m.symbol}`}
                className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 text-sm whitespace-nowrap"
              >
                {m.symbol}
              </Link>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {m.name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs whitespace-nowrap">
              <span className={`tabular-nums font-semibold ${changeClass}`}>
                {formatPercent(m.lastChangePct ?? 0)}
              </span>
              <Link
                href={`/analysis/${m.symbol}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Analysis
              </Link>
              {m.hasValuation && (
                <Link
                  href={`/valuation/${m.symbol}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Valuation
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Combined SSR section for /premarket-movers — shows both gainers and losers.
 */
export async function SsrMoverLinksCombined() {
  const [gainers, losers] = await Promise.all([
    getTopMoversFromDB('gainers', 15),
    getTopMoversFromDB('losers', 15),
  ]);

  if (gainers.length === 0 && losers.length === 0) {
    return null;
  }

  return (
    <section
      className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
      aria-label="Today's notable premarket movers"
    >
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
        Notable Premarket Movers — Stock Analysis Links
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Top movers by percentage change. Click any ticker for detailed analysis and valuation.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {gainers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
              Top Gainers
            </h3>
            <div className="space-y-1">
              {gainers.map((m) => (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/analysis/${m.symbol}`}
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {m.symbol}
                    </Link>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {m.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatPercent(m.lastChangePct ?? 0)}
                    </span>
                    <Link
                      href={`/analysis/${m.symbol}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Analysis
                    </Link>
                    {m.hasValuation && (
                      <Link
                        href={`/valuation/${m.symbol}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Val.
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {losers.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-2">
              Top Losers
            </h3>
            <div className="space-y-1">
              {losers.map((m) => (
                <div
                  key={m.symbol}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Link
                      href={`/analysis/${m.symbol}`}
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {m.symbol}
                    </Link>
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {m.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs whitespace-nowrap">
                    <span className="tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                      {formatPercent(m.lastChangePct ?? 0)}
                    </span>
                    <Link
                      href={`/analysis/${m.symbol}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Analysis
                    </Link>
                    {m.hasValuation && (
                      <Link
                        href={`/valuation/${m.symbol}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Val.
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
