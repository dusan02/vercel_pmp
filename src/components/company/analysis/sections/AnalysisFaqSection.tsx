interface FaqItem {
  q: string;
  a: string;
}

interface AnalysisFaqInput {
  ticker: string;
  companyName: string;
  price: number | null;
  changePct: number | null;
  marketSession: string | null;
  healthScore: number | null;
  verdictText: string | null;
  peRatio: number | null;
  valuationScore: number | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  earningsDate: string | null;
  earningsDays: number | null;
}

/**
 * Data-driven FAQ items — each answer uses real numbers for this ticker so the
 * visible copy and the FAQPage JSON-LD stay unique per page (Google requires
 * the schema to mirror visible content).
 */
export function buildAnalysisFaq({
  ticker,
  companyName,
  price,
  changePct,
  marketSession,
  healthScore,
  verdictText,
  peRatio,
  valuationScore,
  sector,
  industry,
  description,
  earningsDate,
  earningsDays,
}: AnalysisFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const sessionLabel =
    marketSession === 'premarket'
      ? 'in pre-market trading'
      : marketSession === 'postmarket'
        ? 'in after-hours trading'
        : marketSession === 'open'
          ? 'in the regular session'
          : 'at the last market close';

  if (price != null) {
    items.push({
      q: `What is the current ${companyName} (${ticker}) stock price?`,
      a: `${ticker} is trading at $${price.toFixed(2)} ${sessionLabel}${
        changePct != null
          ? `, ${changePct >= 0 ? 'up' : 'down'} ${Math.abs(changePct).toFixed(2)}% on the session`
          : ''
      }. PreMarketPrice tracks ${ticker} pre-market, intraday and after-hours prices.`,
    });
  }

  if (healthScore != null || verdictText) {
    items.push({
      q: `Is ${ticker} stock a buy right now?`,
      a: `PreMarketPrice's quantitative model rates ${companyName}'s financial health at ${
        healthScore != null ? `${Math.round(healthScore)}/100` : 'n/a'
      }${verdictText ? ` — ${verdictText}` : ''}. This is a data-driven snapshot of fundamentals, not investment advice.`,
    });
  }

  if (peRatio != null || valuationScore != null) {
    items.push({
      q: `Is ${ticker} stock overvalued?`,
      a: `${companyName} trades at a trailing P/E of ${peRatio != null ? peRatio.toFixed(1) : 'n/a'}${
        valuationScore != null
          ? ` and our valuation score rates it ${Math.round(valuationScore)}/100 (higher = cheaper vs. its own history)`
          : ''
      }. See the Valuation History and Key Metrics sections for forward P/E, EV/EBITDA and PEG context.`,
    });
  }

  items.push({
    q: `When does ${companyName} report earnings?`,
    a:
      earningsDate && earningsDays != null
        ? `${ticker} is scheduled to report on ${earningsDate} (${
            earningsDays === 0 ? 'today' : earningsDays === 1 ? 'tomorrow' : `in ${earningsDays} days`
          }). Check the Earnings section for recent results and the full calendar.`
        : `No confirmed earnings date is currently scheduled for ${ticker}. The Earnings section lists recent reports and updates as dates are announced.`,
  });

  if (sector) {
    items.push({
      q: `What sector does ${companyName} operate in?`,
      a: `${companyName} operates in the ${sector} sector${industry ? `, within the ${industry} industry` : ''}. The Related Stocks section lists sector peers for comparison.`,
    });
  }

  const firstSentence = description?.match(/^[^.!?]+[.!?]/)?.[0].trim();
  if (firstSentence) {
    items.push({ q: `What does ${companyName} do?`, a: firstSentence });
  }

  return items.slice(0, 6);
}

/** FAQPage JSON-LD — mirrors the visible items above (Google requirement). */
export function buildFaqSchema(items: FaqItem[]) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function AnalysisFaqSection({ items, ticker }: { items: FaqItem[]; ticker: string }) {
  if (!items.length) return null;
  return (
    <section className="mb-6" aria-label="Frequently asked questions">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
        Frequently Asked Questions about {ticker}
      </h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {items.map((item) => (
          <details key={item.q} className="group px-5 py-3.5">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.q}</h3>
              <svg
                className="w-4 h-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
