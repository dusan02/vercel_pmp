'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMarketCap, formatPercent, formatPrice } from '@/lib/utils/format';
import { edgarUrl, type MarketProfile } from '@/lib/analysis/marketProfileMath';

interface Props {
  ticker: string;
  companyName: string;
  initialData: MarketProfile | null;
  isEtf?: boolean;
}

function formatListedLabel(listDate: string, refYear: number): string {
  const [yStr, mStr] = listDate.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return `Listed ${listDate}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yrs = Math.max(0, refYear - y);
  const suffix = yrs >= 1 ? ` · ${yrs}y` : '';
  return `Listed ${months[m - 1] ?? ''} ${y}${suffix}`;
}

function formatDivAmount(v: number, currency = 'USD'): string {
  const prefix = currency === 'USD' ? '$' : `${currency} `;
  return `${prefix}${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}

export function MarketProfileSection({ ticker, companyName, initialData, isEtf = false }: Props) {
  const [data, setData] = useState<MarketProfile | null>(initialData);
  const [loading, setLoading] = useState(!initialData);

  useEffect(() => {
    setData(initialData);
    if (initialData && !initialData.peersPending) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(!initialData);
    fetch(`/api/analysis/${encodeURIComponent(ticker)}/market-profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res: MarketProfile | null) => {
        if (cancelled) return;
        if (res && res.symbol) setData(res);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, initialData]);

  if (loading && !data) {
    return (
      <section
        id="market-profile"
        className="mb-6 scroll-mt-16 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm animate-pulse"
      >
        <div className="h-5 w-56 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-gray-700/60" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) return null;

  const hasPerf = data.performance.length > 0;
  const hasPeers = !isEtf && data.peers.length > 1;
  const hasDivs = data.dividends != null && (data.dividends.active || data.dividends.recent.length > 0);
  const hasFacts = !!(data.facts?.exchange || data.facts?.securityType || data.facts?.listDate || data.facts?.cik);

  if (!hasPerf && !hasPeers && !hasDivs && !hasFacts) return null;

  const refYear = Number((data.asOf ?? data.generatedAt).slice(0, 4)) || 2026;
  const secUrl = edgarUrl(data.facts?.cik);
  const maxDivYearTotal = hasDivs && data.dividends!.years.length > 0
    ? Math.max(...data.dividends!.years.map((y) => y.regular + y.special), 0.0001)
    : 1;

  return (
    <section
      id="market-profile"
      className="mb-6 scroll-mt-16 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-sm space-y-6"
    >
      {/* Header + Polygon Listing & SEC Facts Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Market Profile, Peers &amp; Dividends
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {companyName} ({ticker}) relative return vs. S&amp;P 500, direct industry peers &amp; split-adjusted dividend record
            {data.asOf ? ` · as of ${data.asOf}` : ''}
          </p>
        </div>

        {hasFacts && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {data.facts?.exchange && (
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/70 text-gray-700 dark:text-gray-200 font-medium">
                {data.facts.exchange}
              </span>
            )}
            {data.facts?.securityType && (
              <span className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300">
                {data.facts.securityType}
              </span>
            )}
            {data.facts?.listDate && (
              <span
                className="px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 tabular-nums"
                title={`IPO / Listing Date: ${data.facts.listDate}`}
              >
                {formatListedLabel(data.facts.listDate, refYear)}
              </span>
            )}
            {secUrl && (
              <a
                href={secUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-medium transition-colors tabular-nums"
                title={`View official SEC filings for CIK ${data.facts?.cik}`}
              >
                SEC EDGAR ↗
              </a>
            )}
          </div>
        )}
      </div>

      {/* 1. Performance vs S&P 500 (Alpha Matrix) + 1Y Risk Profile */}
      {hasPerf && (
        <div>
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Performance vs. S&amp;P 500 (SPY)
            </h3>
            {data.risk && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-gray-600 dark:text-gray-300">
                {data.risk.beta != null && (
                  <span title={`1Y daily beta vs SPY (${data.risk.n} sessions)`}>
                    Beta (1Y): <strong className="font-semibold text-gray-900 dark:text-white">{data.risk.beta.toFixed(2)}</strong>
                  </span>
                )}
                {data.risk.vol != null && (
                  <span title="Annualized daily return volatility over 1 year">
                    Volatility: <strong className="font-semibold text-gray-900 dark:text-white">{data.risk.vol.toFixed(1)}%</strong>
                    {data.risk.spxVol != null && (
                      <span className="text-gray-400 dark:text-gray-500"> (SPY {data.risk.spxVol.toFixed(1)}%)</span>
                    )}
                  </span>
                )}
                {data.risk.maxDrawdown != null && (
                  <span title="Worst peak-to-trough decline over the past year">
                    1Y Max DD: <strong className="font-semibold text-rose-600 dark:text-rose-400">{data.risk.maxDrawdown.toFixed(1)}%</strong>
                    {data.risk.spxMaxDrawdown != null && (
                      <span className="text-gray-400 dark:text-gray-500"> (SPY {data.risk.spxMaxDrawdown.toFixed(1)}%)</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {data.performance.map((row) => {
              const sPos = (row.stock ?? 0) >= 0;
              const dPos = (row.diff ?? 0) >= 0;
              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/70 dark:bg-gray-900/40 px-3 py-2.5 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{row.key}</span>
                    {row.diff != null && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums ${
                          dPos
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                        title={`Excess return vs S&P 500 (${row.key})`}
                      >
                        {row.diff > 0 ? '+' : ''}{row.diff.toFixed(1)}pp α
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 text-base font-bold tabular-nums ${sPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatPercent(row.stock)}
                  </div>
                  {row.spx != null && (
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
                      S&amp;P {formatPercent(row.spx)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Side-by-side Competitors & Dividends Grid */}
      {(hasPeers || hasDivs) && (
        <div className={`grid gap-6 ${hasPeers && hasDivs ? 'grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]' : 'grid-cols-1'}`}>
          {/* Direct Industry Competitors (Finnhub Peers) */}
          {hasPeers && (
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Direct Industry Competitors
                </h3>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">Finnhub industry peers</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/80">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50/90 dark:bg-gray-900/60 text-left text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <tr>
                      <th scope="col" className="px-3 py-2 font-medium">Company</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">Price</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">Day %</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">Mkt Cap</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">P/E</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">Rev CAGR</th>
                      <th scope="col" className="px-2.5 py-2 font-medium text-right">Div %</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {data.peers.map((peer) => {
                      const up = (peer.changePct ?? 0) >= 0;
                      return (
                        <tr
                          key={peer.symbol}
                          className={
                            peer.isSelf
                              ? 'bg-blue-50/60 dark:bg-blue-950/30 font-medium'
                              : 'hover:bg-gray-50/70 dark:hover:bg-gray-700/30 transition-colors'
                          }
                        >
                          <td className="px-3 py-2 whitespace-nowrap">
                            {peer.isSelf ? (
                              <span className="font-bold text-gray-900 dark:text-white">{peer.symbol}</span>
                            ) : (
                              <Link
                                href={`/analysis/${peer.symbol}`}
                                className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                {peer.symbol}
                              </Link>
                            )}
                            {peer.name && (
                              <span className="ml-1.5 text-[11px] text-gray-500 dark:text-gray-400 hidden sm:inline max-w-[11rem] truncate align-bottom inline-block">
                                {peer.name}
                              </span>
                            )}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                            {peer.price != null ? `$${formatPrice(peer.price)}` : '—'}
                          </td>
                          <td className={`px-2.5 py-2 text-right tabular-nums font-medium ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {peer.changePct != null ? formatPercent(peer.changePct) : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {peer.marketCap != null ? `$${formatMarketCap(peer.marketCap)}` : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {peer.pe != null && peer.pe > 0 ? `${peer.pe.toFixed(1)}×` : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {peer.revenueCagr != null ? `${peer.revenueCagr > 0 ? '+' : ''}${peer.revenueCagr.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-2.5 py-2 text-right tabular-nums text-gray-700 dark:text-gray-300">
                            {peer.dividendYield != null && peer.dividendYield > 0 ? `${peer.dividendYield.toFixed(2)}%` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">
                            {peer.overallScore != null ? `${peer.overallScore.toFixed(0)}/100` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Split-Adjusted Dividend Profile & History (Polygon Dividends + Splits) */}
          {hasDivs && (() => {
            const div = data.dividends!;
            return (
              <div className="min-w-0 flex flex-col justify-between rounded-xl border border-gray-100 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-900/30 p-4">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Dividends &amp; Payout (Split-Adjusted)
                    </h3>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        div.active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {div.active ? (div.frequencyLabel ?? 'Regular') : 'Paused / Prior'}
                    </span>
                  </div>

                  {/* Summary Stat Pills */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">Annual Rate</div>
                      <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                        {div.forwardAnnual != null ? `${formatDivAmount(div.forwardAnnual, div.currency)}/yr` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">TTM Paid</div>
                      <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                        {div.ttmTotal != null ? formatDivAmount(div.ttmTotal, div.currency) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">5Y Div CAGR</div>
                      <div className={`text-sm font-bold tabular-nums ${div.cagr5y != null && div.cagr5y >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>
                        {div.cagr5y != null ? `${div.cagr5y > 0 ? '+' : ''}${div.cagr5y.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                    {div.growthStreak != null && div.growthStreak > 0 && (
                      <div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">Growth Streak</div>
                        <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                          {div.growthStreak}{div.streakCapped ? '+' : ''} yrs
                        </div>
                      </div>
                    )}
                    {data.payoutRatio != null && data.payoutRatio > 0 && (
                      <div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400">Payout Ratio</div>
                        <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
                          {data.payoutRatio.toFixed(1)}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ex-Dividend & Pay Date Details */}
                  {(div.upcoming || div.last) && (
                    <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1 mb-3 pt-2 border-t border-gray-200/70 dark:border-gray-700/60 tabular-nums">
                      {div.upcoming && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-indigo-600 dark:text-indigo-400">
                            Next Ex-Div: {div.upcoming.exDate}
                          </span>
                          <span>
                            {formatDivAmount(div.upcoming.amount, div.currency)}
                            {div.upcoming.payDate ? ` · Pay ${div.upcoming.payDate}` : ''}
                          </span>
                        </div>
                      )}
                      {div.last && (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-gray-500 dark:text-gray-400">
                            Last Ex-Div: {div.last.exDate}
                          </span>
                          <span>
                            {formatDivAmount(div.last.amount, div.currency)}
                            {div.last.payDate ? ` · Paid ${div.last.payDate}` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Annual Dividend History Mini Bar Chart */}
                {div.years.length > 0 && (
                  <div className="pt-2 border-t border-gray-200/70 dark:border-gray-700/60">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                      <span>Annual Dividend / Share</span>
                      <span>Split-adjusted ({div.years[0]!.year}–{div.years[div.years.length - 1]!.year})</span>
                    </div>
                    <div className="flex items-end gap-1.5 h-16">
                      {div.years.map((yr) => {
                        const total = yr.regular + yr.special;
                        const pctH = Math.max(8, Math.round((total / maxDivYearTotal) * 100));
                        return (
                          <div
                            key={yr.year}
                            className="flex-1 flex flex-col items-center justify-end h-full group"
                            title={`${yr.year}${yr.partial ? ' YTD' : ''}: ${formatDivAmount(total, div.currency)}${yr.special > 0 ? ` (incl. ${formatDivAmount(yr.special, div.currency)} special)` : ''}`}
                          >
                            <div
                              className={`w-full rounded-t transition-colors ${
                                yr.partial
                                  ? 'bg-emerald-300/80 dark:bg-emerald-700/60 border border-dashed border-emerald-500'
                                  : 'bg-emerald-500 dark:bg-emerald-500/85 group-hover:bg-emerald-600'
                              }`}
                              style={{ height: `${pctH}%` }}
                            />
                            <span className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                              &apos;{String(yr.year).slice(-2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
