import type { summarizeLossYears } from '@/lib/utils/analysisMath';

interface KeyInsightsCache {
  valuationScore: number | null;
  verdictText: string | null;
  piotroskiScore: number | null;
  altmanZ: number | null;
  beneishScore: number | null;
  revenueCagr: number | null;
  netIncomeCagr: number | null;
  fcfMargin: number | null;
  debtRepaymentYears: number | null;
  interestCoverage: number | null;
  negativeNiYears: number | null;
  humanDebtInfo: string | null;
  humanPeInfo: string | null;
}

interface KeyInsightsSectionProps {
  ticker: string;
  companyName: string;
  changePct: number | null;
  marketSession: string;
  cache: KeyInsightsCache | null;
  lossHistory?: ReturnType<typeof summarizeLossYears>;
  peRatio: number | null;
  roe: number | null;
  dividendYield: number | null;
  earningsDays: number | null;
  moversReason: string | null;
  moversCategory: string | null;
  /** Card spans the full page width — split prose and bullets into two
      columns so the right half doesn't sit empty. Ignored when the card
      shares a row (paired layout already fills its width). */
  wide?: boolean;
}

function num(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/**
 * Server-rendered, data-driven prose unique to each ticker.
 * Every sentence is emitted only when the underlying metric crosses a
 * threshold, so each page produces a genuinely different text — this is
 * the "unique content" signal that gets analysis pages out of the
 * "Crawled – currently not indexed" bucket (620 pages in GSC).
 */
export function KeyInsightsSection({
  ticker,
  companyName,
  changePct,
  marketSession,
  cache,
  lossHistory,
  peRatio,
  roe,
  dividendYield,
  earningsDays,
  moversReason,
  moversCategory,
  wide = false,
}: KeyInsightsSectionProps) {
  const insights: string[] = [];

  // Today's move with session context (+ catalyst if the movers engine has one)
  if (num(changePct) && Math.abs(changePct) >= 0.5) {
    const dir = changePct > 0 ? 'up' : 'down';
    const pct = `${Math.abs(changePct).toFixed(2)}%`;
    const sess =
      marketSession === 'pre'
        ? "in today's pre-market session"
        : marketSession === 'after'
          ? 'in after-hours trading'
          : marketSession === 'closed'
            ? 'at the last close'
            : 'today';
    insights.push(
      moversReason
        ? `${ticker} is ${dir} ${pct} ${sess} — ${moversReason}.`
        : `${ticker} is ${dir} ${pct} ${sess}.`,
    );
  }

  // AI verdict (already unique per ticker when present)
  if (cache?.verdictText) {
    insights.push(`Composite verdict for ${companyName}: ${cache.verdictText}.`);
  }

  // Piotroski F-Score
  if (num(cache?.piotroskiScore)) {
    const p = cache.piotroskiScore;
    if (p >= 7) {
      insights.push(
        `${companyName} meets ${p} of 9 Piotroski F-Score criteria, placing its fundamental strength in the top tier of US-listed stocks.`,
      );
    } else if (p <= 3) {
      insights.push(
        `${companyName} meets only ${p} of 9 Piotroski F-Score criteria — a sign of weak underlying fundamentals.`,
      );
    } else {
      insights.push(
        `Piotroski F-Score of ${p}/9 indicates mixed fundamentals for ${companyName}.`,
      );
    }
  }

  // Altman Z-Score
  if (num(cache?.altmanZ)) {
    const z = cache.altmanZ;
    if (z >= 2.99) {
      insights.push(
        `Altman Z-Score of ${z.toFixed(2)} sits comfortably in the safe zone (≥ 2.99), indicating low bankruptcy risk.`,
      );
    } else if (z >= 1.81) {
      insights.push(
        `Altman Z-Score of ${z.toFixed(2)} falls in the grey zone (1.81–2.99) — financial distress is unlikely but not ruled out.`,
      );
    } else {
      insights.push(
        `Altman Z-Score of ${z.toFixed(2)} is below the 1.81 distress threshold — an elevated financial-risk flag.`,
      );
    }
  }

  // Beneish M-Score
  if (num(cache?.beneishScore)) {
    const b = cache.beneishScore;
    if (b < -2.22) {
      insights.push(
        `Beneish M-Score of ${b.toFixed(2)} suggests a low likelihood of earnings manipulation.`,
      );
    } else if (b > -1.78) {
      insights.push(
        `Beneish M-Score of ${b.toFixed(2)} is above the −1.78 flag threshold, a signal that reported earnings warrant closer scrutiny.`,
      );
    }
  }

  // Growth profile
  if (num(cache?.revenueCagr)) {
    const r = cache.revenueCagr;
    if (r >= 15) {
      insights.push(
        `Revenue has compounded at roughly ${r.toFixed(0)}% annually${
          num(cache?.netIncomeCagr) && cache.netIncomeCagr > 0
            ? `, with net income growing about ${cache.netIncomeCagr.toFixed(0)}% per year`
            : ''
        } — a strong growth profile.`,
      );
    } else if (r <= 0) {
      insights.push(
        `Revenue has been contracting (CAGR ≈ ${r.toFixed(0)}%), which weighs on the growth outlook.`,
      );
    }
  }

  // Cash generation — fcfMargin is stored as a fraction (0.15 = 15%)
  if (num(cache?.fcfMargin)) {
    const f = cache.fcfMargin;
    if (f >= 0.15) {
      insights.push(
        `${companyName} converts about ${(f * 100).toFixed(0)}% of revenue into free cash flow — strong cash generation.`,
      );
    } else if (f < 0) {
      insights.push(
        `Free-cash-flow margin is negative (${(f * 100).toFixed(0)}%) — the business currently burns cash.`,
      );
    }
  }

  // Debt burden — prefer the pre-composed human string when available
  if (cache?.humanDebtInfo) {
    insights.push(cache.humanDebtInfo.replace(/\.+$/, '') + '.');
  } else if (num(cache?.debtRepaymentYears)) {
    const d = cache.debtRepaymentYears;
    if (d <= 3) {
      insights.push(
        `At the current rate of free cash flow, ${companyName} could repay its entire debt in about ${d.toFixed(1)} years — a light debt burden.`,
      );
    } else if (d > 10) {
      insights.push(
        `Repaying all debt would take over ${Math.round(d)} years of free cash flow — a heavy debt load.`,
      );
    }
  }

  if (num(cache?.interestCoverage) && cache.interestCoverage < 2) {
    insights.push(
      `Interest coverage of ${cache.interestCoverage.toFixed(1)}× leaves little room for earnings shocks.`,
    );
  }

  if (lossHistory && lossHistory.lossYears > 0) {
    insights.push(
      `${companyName} posted a net loss in ${lossHistory.lossYears} of ${lossHistory.reportedYears} available completed fiscal years (${lossHistory.firstYear}–${lossHistory.lastYear}).`,
    );
  }

  // Valuation vs its own history (valuationScore = percentile-like 0–100)
  if (num(cache?.valuationScore)) {
    const v = cache.valuationScore;
    if (v >= 70) {
      insights.push(
        `At a valuation score of ${v.toFixed(0)}/100, ${ticker} trades near the cheapest end of its own historical range${
          num(peRatio) ? ` (P/E ${peRatio.toFixed(1)})` : ''
        }.`,
      );
    } else if (v <= 30) {
      insights.push(
        `At a valuation score of ${v.toFixed(0)}/100, ${ticker} trades at a premium to its historical multiples${
          num(peRatio) ? ` (P/E ${peRatio.toFixed(1)})` : ''
        }.`,
      );
    }
  } else if (cache?.humanPeInfo) {
    insights.push(cache.humanPeInfo.replace(/\.+$/, '') + '.');
  }

  if (num(roe) && roe >= 20) {
    insights.push(`Return on equity of ${roe.toFixed(1)}% is well above the market average.`);
  }
  if (num(dividendYield) && dividendYield >= 2) {
    insights.push(`The stock currently yields ${dividendYield.toFixed(1)}% in dividends.`);
  }

  // Earnings catalyst
  if (earningsDays != null && earningsDays <= 14) {
    insights.push(
      `${companyName} reports earnings ${
        earningsDays === 0 ? 'today' : earningsDays === 1 ? 'tomorrow' : `in ${earningsDays} days`
      } — a potential volatility catalyst.`,
    );
  }

  if (insights.length < 2) return null;

  const midpoint = Math.ceil(insights.length / 2);
  const paragraph = insights.slice(0, midpoint).join(' ');
  const bullets = insights.slice(midpoint);

  const twoCol = wide && bullets.length > 0;

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
        Key Insights: {companyName} ({ticker})
      </h2>
      <div className={twoCol ? 'grid gap-x-10 gap-y-3 lg:grid-cols-2' : undefined}>
        <p className={`text-sm text-gray-600 dark:text-gray-400 leading-relaxed ${twoCol ? '' : 'max-w-prose'}`}>{paragraph}</p>
        {bullets.length > 0 && (
          <ul className={`list-disc pl-5 space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ${twoCol ? '' : 'mt-3 max-w-prose'}`}>
            {bullets.map((s) => (
              <li key={s.slice(0, 40)}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
