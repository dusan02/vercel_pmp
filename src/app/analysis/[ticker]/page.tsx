import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { generateCompanyMetadata } from '@/lib/seo/metadata';
import { getCompanyName } from '@/lib/companyNames';
import { AnalysisTabClient } from '@/components/company/AnalysisTabClient';
import { NewsSection } from '@/components/company/analysis/NewsSection';
import { formatPercent, formatPrice } from '@/lib/utils/heatmapFormat';
import { getEligibleAnalysisTickers } from '@/lib/seo/eligibleTickers';
import { getEarningsForTicker } from '@/lib/seo/earningsSSR';
import ShareButtons from '@/components/ShareButtons';

export const revalidate = 60;

interface PageProps {
  params: Promise<{ ticker: string }>;
}

const baseUrl = 'https://premarketprice.com';

async function getTickerData(symbol: string) {
  try {
    return await prisma.ticker.findUnique({
      where: { symbol },
      select: {
        symbol: true,
        name: true,
        sector: true,
        industry: true,
        lastPrice: true,
        lastChangePct: true,
        lastMarketCap: true,
        description: true,
        employees: true,
        websiteUrl: true,
        headquarters: true,
        logoUrl: true,
        latestPrevClose: true,
        moversReason: true,
        moversCategory: true,
        aiConfidence: true,
        isSbcAlert: true,
        socialCopy: true,
        analysisCache: {
          select: {
            healthScore: true,
            profitabilityScore: true,
            valuationScore: true,
            verdictText: true,
            piotroskiScore: true,
            altmanZ: true,
            revenueCagr: true,
            netIncomeCagr: true,
            fcfMargin: true,
            debtRepaymentYears: true,
            humanDebtInfo: true,
            humanPeInfo: true,
            marginStability: true,
          },
        },
        finnhubMetrics: {
          select: {
            peRatio: true,
            forwardPe: true,
            pbRatio: true,
            psRatio: true,
            evEbitda: true,
            pegRatio: true,
            roe: true,
            roa: true,
            grossMargin: true,
            operatingMargin: true,
            netMargin: true,
            revenueGrowth: true,
            earningsGrowth: true,
            currentRatio: true,
            debtEquityRatio: true,
            dividendYield: true,
            beta: true,
          },
        },
        finnhubPriceTarget: {
          select: {
            targetHigh: true,
            targetLow: true,
            targetMean: true,
            targetMedian: true,
            numberOfAnalysts: true,
            currentPrice: true,
            fetchedAt: true,
          },
        },
        finnhubRecommendation: {
          select: {
            period: true,
            strongBuy: true,
            buy: true,
            hold: true,
            sell: true,
            strongSell: true,
            fetchedAt: true,
          },
        },
      },
    });
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  const tickers = await getEligibleAnalysisTickers();
  return tickers.map((t) => ({ ticker: t.toLowerCase() }));
}

/**
 * Fetch recent significant moves from SessionPrice for the "Recent Market Moves"
 * section. Same logic as /movers/[symbol] — |zScore| >= 2.0, last 30 days.
 */
async function getRecentSignificantMoves(symbol: string) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [positive, negative] = await Promise.all([
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { gte: 2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
      prisma.sessionPrice.findMany({
        where: { symbol, date: { gte: since }, zScore: { lte: -2.0 } },
        orderBy: { date: 'desc' },
        take: 5,
        select: { date: true, session: true, changePct: true, zScore: true, lastPrice: true },
      }),
    ]);

    const all = [...positive, ...negative].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
    return all.slice(0, 5);
  } catch {
    return [];
  }
}

function formatSessionLabel(session: string): string {
  const map: Record<string, string> = {
    pre: 'Pre-market',
    live: 'Regular',
    after: 'After-hours',
    closed: 'Closed',
  };
  return map[session] ?? session;
}

// --- Server-rendered SEO summary helpers ---

function scoreLabel(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 75) return 'strong';
  if (score >= 50) return 'moderate';
  return 'weak';
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !isFinite(value)) return '';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);
  const companyName = data?.name || getCompanyName(tickerUpper);

  const metadata = generateCompanyMetadata({
    ticker: tickerUpper,
    companyName,
    ...(data?.lastPrice != null ? { price: data.lastPrice } : {}),
    ...(data?.lastChangePct != null ? { percentChange: data.lastChangePct } : {}),
    ...(data?.lastMarketCap != null ? { marketCap: data.lastMarketCap } : {}),
    ...(data?.sector ? { sector: data.sector } : {}),
    ...(data?.industry ? { industry: data.industry } : {}),
  });

  // Thin-content guard: tickers without AnalysisCache have no fundamental
  // analysis data. The analysis tab is client-rendered (ssr:false), so without
  // AnalysisCache the server-rendered HTML is minimal. → noindex to avoid
  // wasting crawl budget on empty pages.
  // Use the data already fetched above instead of a redundant DB query.
  const hasCache = data?.analysisCache != null;
  if (!hasCache) {
    return {
      ...metadata,
      robots: { index: false, follow: true },
    };
  }

  return metadata;
}

export default async function AnalysisPage({ params }: PageProps) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const data = await getTickerData(tickerUpper);

  if (!data) {
    notFound();
  }

  const companyName = data?.name || getCompanyName(tickerUpper) || tickerUpper;

  // Fetch earnings + recent moves in parallel (they're independent)
  const [earningsData, recentMoves] = await Promise.all([
    getEarningsForTicker(tickerUpper),
    getRecentSignificantMoves(tickerUpper),
  ]);

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: baseUrl },
      { '@type': 'ListItem', position: 2, name: 'Stocks', item: `${baseUrl}/premarket-movers` },
      { '@type': 'ListItem', position: 3, name: `${companyName} (${tickerUpper})`, item: `${baseUrl}/analysis/${tickerUpper}` },
    ],
  };

  const stockSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${companyName} Stock`,
    tickerSymbol: tickerUpper,
    description: data?.description || `Real-time pre-market stock data and analysis for ${companyName} (${tickerUpper}). Track price, % change, market cap, earnings and more.`,
    ...(data?.sector ? { category: data.sector } : {}),
    provider: {
      '@type': 'Organization',
      name: 'PreMarketPrice',
      url: baseUrl,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(stockSchema) }} />

      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Breadcrumb */}
        <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700" aria-label="Breadcrumb">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <ol className="flex items-center space-x-2 text-sm">
              <li><Link href="/" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Home</Link></li>
              <li className="text-gray-400">/</li>
              <li><Link href="/premarket-movers" className="text-gray-500 hover:text-blue-600 dark:text-gray-400">Stocks</Link></li>
              <li className="text-gray-400">/</li>
              <li className="text-gray-900 dark:text-gray-100 font-medium">{tickerUpper}</li>
            </ol>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* SEO: natural-language summary (hidden visually, for crawlers) */}
          {(() => {
            const cache = data?.analysisCache;
            const metrics = data?.finnhubMetrics;
            const summaryParts: string[] = [];
            if (data?.description) {
              const desc = data.description.length > 160
                ? data.description.slice(0, 157).trim() + '...'
                : data.description;
              summaryParts.push(desc);
            }
            const analysisParts: string[] = [];
            if (cache?.valuationScore != null) {
              analysisParts.push(`valuation score of ${cache.valuationScore.toFixed(0)}/100 (${scoreLabel(cache.valuationScore)})`);
            }
            if (cache?.profitabilityScore != null) {
              analysisParts.push(`profitability score of ${cache.profitabilityScore.toFixed(0)}/100 (${scoreLabel(cache.profitabilityScore)})`);
            }
            if (cache?.healthScore != null) {
              analysisParts.push(`financial health score of ${cache.healthScore.toFixed(0)}/100 (${scoreLabel(cache.healthScore)})`);
            }
            if (cache?.piotroskiScore != null) {
              analysisParts.push(`Piotroski F-Score of ${cache.piotroskiScore}/9`);
            }
            if (cache?.altmanZ != null) {
              const zone = cache.altmanZ > 3 ? 'safe zone' : cache.altmanZ > 1.8 ? 'grey zone' : 'distressed';
              analysisParts.push(`Altman Z-Score of ${cache.altmanZ.toFixed(2)} (${zone})`);
            }
            if (metrics?.revenueGrowth != null) {
              analysisParts.push(`revenue growth of ${formatPct(metrics.revenueGrowth)} YoY`);
            }
            if (analysisParts.length > 0) {
              summaryParts.push(`${companyName} (${tickerUpper}) has a ${analysisParts.join(', ')}.`);
            }
            if (cache?.verdictText) {
              summaryParts.push(cache.verdictText);
            }
            if (summaryParts.length === 0) return null;
            return (
              <div className="sr-only" aria-hidden="false">
                {summaryParts.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            );
          })()}

          {/* Why is {TICKER} moving? — AI insight from AiMoversService */}
          {data?.moversReason && (data.lastChangePct != null && Math.abs(data.lastChangePct) >= 2) && (
            <section className="mb-6 max-w-4xl">
              <div className={`rounded-2xl border p-5 sm:p-6 ${
                data.isSbcAlert
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
              }`}>
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    (data.lastChangePct ?? 0) >= 0
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  }`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {(data.lastChangePct ?? 0) >= 0
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h7v7M20 7l-7 7M5 17H4a1 1 0 01-1-1V5a1 1 0 011-1h1m4 0h4m-4 0V3a1 1 0 011-1h2a1 1 0 011 1v1m-4 0h4" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M11 17H4v-7m0 7l7-7M19 7h1a1 1 0 011 1v11a1 1 0 01-1 1h-1m-4 0h-4m4 0v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2m4 0h-4" />
                      }
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <h2 className="text-base font-bold text-gray-900 dark:text-white">
                        Why is {tickerUpper} moving?
                      </h2>
                      {data.moversCategory && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          {data.moversCategory}
                        </span>
                      )}
                      {data.isSbcAlert && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white">
                          SBC Alert
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                      {data.moversReason}
                    </p>
                    {data.aiConfidence != null && (
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                        <span>AI confidence:</span>
                        <span className={`font-bold ${
                          data.aiConfidence >= 75 ? 'text-green-600 dark:text-green-400'
                            : data.aiConfidence >= 50 ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400'
                        }`}>
                          {data.aiConfidence >= 75 ? 'High' : data.aiConfidence >= 50 ? 'Medium' : 'Low'}
                          {' '}({data.aiConfidence}%)
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">·</span>
                        <span className={`font-semibold ${(data.lastChangePct ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {(data.lastChangePct ?? 0) >= 0 ? '+' : ''}{data.lastChangePct!.toFixed(2)}% today
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Full interactive analysis (client-side) */}
          <AnalysisTabClient ticker={tickerUpper} hideSearch />

          {/* Analyst Consensus section — SSR from FinnhubPriceTarget + FinnhubRecommendation DB */}
          {(() => {
            const pt = data?.finnhubPriceTarget;
            const rec = data?.finnhubRecommendation;
            const hasPt = pt && (pt.targetMean != null || pt.targetMedian != null);
            const hasRec = rec && (rec.strongBuy != null || rec.buy != null || rec.hold != null);
            if (!hasPt && !hasRec) return null;

            const target = pt?.targetMean ?? pt?.targetMedian ?? null;
            const currentPrice = pt?.currentPrice ?? data?.lastPrice ?? null;
            const upside = target != null && currentPrice != null && currentPrice > 0
              ? ((target / currentPrice - 1) * 100)
              : null;
            const freshness = pt?.fetchedAt ?? rec?.fetchedAt;
            const freshnessDate = freshness ? new Date(freshness) : null;
            const freshnessStr = freshnessDate && !isNaN(freshnessDate.getTime())
              ? freshnessDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : null;

            // Recommendation consensus
            const sb = rec?.strongBuy ?? 0;
            const b = rec?.buy ?? 0;
            const h = rec?.hold ?? 0;
            const s = rec?.sell ?? 0;
            const ss = rec?.strongSell ?? 0;
            const totalAnalysts = sb + b + h + s + ss;
            const buyPct = totalAnalysts > 0 ? Math.round(((sb + b) / totalAnalysts) * 100) : null;
            const consensusLabel = totalAnalysts > 0
              ? buyPct != null && buyPct >= 70 ? 'Strong Buy'
                : buyPct != null && buyPct >= 50 ? 'Buy'
                : buyPct != null && buyPct >= 30 ? 'Hold'
                : 'Sell'
              : null;

            return (
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Analyst Consensus
                  </h2>
                  {consensusLabel && (
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      consensusLabel === 'Strong Buy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : consensusLabel === 'Buy' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : consensusLabel === 'Hold' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                    }`}>
                      {consensusLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Wall Street consensus estimates — not a PMP forecast{freshnessStr ? ` · Updated ${freshnessStr}` : ''}
                </p>

                {/* Price target cards */}
                {hasPt && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    {currentPrice != null && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Price</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{formatPrice(currentPrice)}</div>
                      </div>
                    )}
                    {target != null && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">Consensus Target</div>
                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 tabular-nums">{formatPrice(target)}</div>
                      </div>
                    )}
                    {upside != null && (
                      <div className={`rounded-lg p-3 ${upside >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-rose-50 dark:bg-rose-900/20'}`}>
                        <div className={`text-xs mb-1 ${upside >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {upside >= 0 ? 'Upside' : 'Downside'}
                        </div>
                        <div className={`text-lg font-bold tabular-nums ${upside >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}`}>
                          {formatPercent(upside)}
                        </div>
                      </div>
                    )}
                    {pt?.numberOfAnalysts != null && pt.numberOfAnalysts > 0 && (
                      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Analysts</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">{pt.numberOfAnalysts}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Price target range */}
                {hasPt && (pt?.targetHigh != null || pt?.targetLow != null) && (
                  <div className="flex flex-wrap gap-4 text-sm pt-3 border-t border-gray-100 dark:border-gray-700 mb-4">
                    {pt?.targetHigh != null && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">High Target: </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatPrice(pt.targetHigh)}</span>
                      </div>
                    )}
                    {pt?.targetLow != null && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Low Target: </span>
                        <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{formatPrice(pt.targetLow)}</span>
                      </div>
                    )}
                    {pt?.targetMedian != null && pt?.targetMean != null && pt.targetMedian !== pt.targetMean && (
                      <div>
                        <span className="text-gray-500 dark:text-gray-400">Median: </span>
                        <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{formatPrice(pt.targetMedian)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Recommendation breakdown bar */}
                {hasRec && totalAnalysts > 0 && (
                  <div className={hasPt ? 'pt-4 border-t border-gray-100 dark:border-gray-700' : ''}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Analyst Recommendations
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {totalAnalysts} analyst{totalAnalysts !== 1 ? 's' : ''}{rec?.period ? ` · ${rec.period}` : ''}
                      </span>
                    </div>
                    <div
                      className="flex h-6 rounded-lg overflow-hidden"
                      role="progressbar"
                      aria-valuenow={buyPct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${consensusLabel ?? 'Analyst'} consensus — ${totalAnalysts} analysts`}
                    >
                      {sb > 0 && <div className="bg-emerald-600 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(sb / totalAnalysts) * 100}%` }} title={`Strong Buy: ${sb}`}>{sb > 1 ? sb : ''}</div>}
                      {b > 0 && <div className="bg-green-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(b / totalAnalysts) * 100}%` }} title={`Buy: ${b}`}>{b > 1 ? b : ''}</div>}
                      {h > 0 && <div className="bg-yellow-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(h / totalAnalysts) * 100}%` }} title={`Hold: ${h}`}>{h > 1 ? h : ''}</div>}
                      {s > 0 && <div className="bg-orange-500 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(s / totalAnalysts) * 100}%` }} title={`Sell: ${s}`}>{s > 1 ? s : ''}</div>}
                      {ss > 0 && <div className="bg-rose-600 flex items-center justify-center text-xs text-white font-medium" style={{ width: `${(ss / totalAnalysts) * 100}%` }} title={`Strong Sell: ${ss}`}>{ss > 1 ? ss : ''}</div>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-600 mr-1"></span>Strong Buy {sb}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Buy {b}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1"></span>Hold {h}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1"></span>Sell {s}</span>
                      <span><span className="inline-block w-2 h-2 rounded-full bg-rose-600 mr-1"></span>Strong Sell {ss}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Earnings section — SSR from EarningsCalendar DB */}
          {(() => {
            const { upcoming, recent } = earningsData;
            if (upcoming.length === 0 && recent.length === 0) return null;

            const formatEpsShort = (v: number | null) => v == null ? '—' : `$${v.toFixed(2)}`;
            const formatRevShort = (v: number | null) => {
              if (v == null) return '—';
              if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
              if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
              return `$${v.toFixed(0)}`;
            };
            const timeLabel = (t: string) => t === 'bmo' ? 'Pre-Mkt' : t === 'amc' ? 'After-Hrs' : t === 'dmt' ? 'During' : 'TBD';
            const formatDateShort = (d: string) => {
              // Handle both 'YYYY-MM-DD' and full ISO strings safely
              const date = d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d);
              if (isNaN(date.getTime())) return d;
              return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            };

            return (
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Earnings
                  </h2>
                  <Link href="/earnings" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    View earnings calendar →
                  </Link>
                </div>

                {upcoming.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Next Earnings</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                            <th scope="col" className="px-3 py-2 font-medium">Date</th>
                            <th scope="col" className="px-3 py-2 font-medium">Time</th>
                            <th scope="col" className="px-3 py-2 font-medium">EPS Est.</th>
                            <th scope="col" className="px-3 py-2 font-medium">Rev Est.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {upcoming.map((e, i) => (
                            <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                              <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatDateShort(e.date)}</td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{timeLabel(e.time)}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsEstimate)}</td>
                              <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueEstimate)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {recent.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recent Earnings Results</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                            <th scope="col" className="px-3 py-2 font-medium">Date</th>
                            <th scope="col" className="px-3 py-2 font-medium">Time</th>
                            <th scope="col" className="px-3 py-2 font-medium">EPS Est.</th>
                            <th scope="col" className="px-3 py-2 font-medium">EPS Actual</th>
                            <th scope="col" className="px-3 py-2 font-medium">Surprise</th>
                            <th scope="col" className="px-3 py-2 font-medium">Rev Est.</th>
                            <th scope="col" className="px-3 py-2 font-medium">Rev Actual</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((e, i) => {
                            const surprise = e.epsSurprisePercent;
                            return (
                              <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatDateShort(e.date)}</td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{timeLabel(e.time)}</td>
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsEstimate)}</td>
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatEpsShort(e.epsActual)}</td>
                                <td className={`px-3 py-2 tabular-nums font-semibold ${surprise != null ? (surprise >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-gray-400'}`}>
                                  {surprise != null ? formatPercent(surprise) : '—'}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueEstimate)}</td>
                                <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">{formatRevShort(e.revenueActual)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Recent Market Moves — from SessionPrice data */}
          {(() => {
            if (recentMoves.length === 0) return null;

            return (
              <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Recent Market Moves
                  </h2>
                  <Link
                    href={`/movers/${tickerUpper}`}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    See all {tickerUpper} moves →
                  </Link>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                        <th scope="col" className="px-3 py-2 font-medium">Date</th>
                        <th scope="col" className="px-3 py-2 font-medium">Session</th>
                        <th scope="col" className="px-3 py-2 font-medium">Price</th>
                        <th scope="col" className="px-3 py-2 font-medium">Move</th>
                        <th scope="col" className="px-3 py-2 font-medium">Z-Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentMoves.map((m, i) => {
                        const moveUp = m.changePct >= 0;
                        const dateStr = m.date.toISOString().split('T')[0];
                        const isPremarket = m.session === 'pre';
                        const archiveLink = isPremarket
                          ? (moveUp ? `/premarket-gainers/${dateStr}` : `/premarket-losers/${dateStr}`)
                          : null;
                        return (
                          <tr key={i} className="border-b border-gray-50 dark:border-gray-700/50">
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {archiveLink ? (
                                <Link href={archiveLink} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                                  {m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </Link>
                              ) : (
                                m.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {formatSessionLabel(m.session)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {formatPrice(m.lastPrice)}
                            </td>
                            <td className={`px-3 py-2 tabular-nums font-semibold ${moveUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formatPercent(m.changePct)}
                            </td>
                            <td className="px-3 py-2 tabular-nums text-gray-700 dark:text-gray-300">
                              {m.zScore?.toFixed(2) ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Cross-link to valuation and financials pages + share */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 text-sm flex flex-wrap items-center gap-4">
            <Link
              href={`/valuation/${tickerUpper}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {companyName} ({tickerUpper}) Valuation & P/E History →
            </Link>
            <Link
              href={`/financials/${tickerUpper}`}
              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
            >
              {companyName} ({tickerUpper}) Financial Statements →
            </Link>
            <ShareButtons
              url={`${baseUrl}/analysis/${tickerUpper}`}
              title={`${companyName} (${tickerUpper}) Stock Analysis | PreMarketPrice`}
              description={data?.description?.slice(0, 100)}
            />
          </div>

          {/* SEO: Related stocks */}
          <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Explore More Stocks</h2>
            <div className="flex flex-wrap gap-2">
              {['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'WMT', 'V']
                .filter((t) => t !== tickerUpper)
                .map((t) => (
                  <Link
                    key={t}
                    href={`/analysis/${t}`}
                    className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    {t}
                  </Link>
                ))}
              <Link href="/premarket-movers" className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-sm font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition-colors">
                View all stocks →
              </Link>
            </div>
          </div>

          {/* Latest news — at the very bottom, client-side fetch from Finnhub, cached 30min */}
          <NewsSection ticker={tickerUpper} />
        </main>
      </div>
    </>
  );
}
