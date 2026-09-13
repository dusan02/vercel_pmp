interface FaqItem {
  question: string;
  answer: string;
}

interface TickerFaqProps {
  ticker: string;
  companyName: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  healthScore: number | null;
  nextEarningsDate: string | null;
}

function fmtMoney(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function fmtMcap(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
}

/**
 * Builds the FAQ items shared by the visible section and the FAQPage JSON-LD.
 * Answers are direct, factual and number-rich so AI engines (ChatGPT,
 * Perplexity, Google AI Overviews) can quote them verbatim (GEO).
 */
export function buildTickerFaq(p: TickerFaqProps): FaqItem[] {
  const items: FaqItem[] = [];

  if (p.price != null) {
    items.push({
      question: `What is ${p.ticker}'s pre-market price today?`,
      answer: `${p.companyName} (${p.ticker}) last traded at ${fmtMoney(p.price)}${p.changePct != null ? `, ${fmtPct(p.changePct)} versus the previous close` : ''}. Pre-market prices on PreMarketPrice are refreshed continuously during the pre-market session (4:00 AM – 9:30 AM ET) and every page shows a last-updated timestamp.`,
    });
  }

  if (p.marketCap != null && p.marketCap > 0) {
    items.push({
      question: `What is ${p.ticker}'s market capitalization?`,
      answer: `${p.companyName} (${p.ticker}) has a market capitalization of approximately ${fmtMcap(p.marketCap)}, based on the latest available share price and shares outstanding.`,
    });
  }

  if (p.sector) {
    items.push({
      question: `What sector and industry does ${p.companyName} operate in?`,
      answer: `${p.companyName} (${p.ticker}) is classified in the ${p.sector} sector${p.industry ? `, specifically in the ${p.industry} industry` : ''}. You can compare it with other ${p.sector} stocks on the sector page.`,
    });
  }

  if (p.nextEarningsDate) {
    items.push({
      question: `When does ${p.companyName} report its next earnings?`,
      answer: `${p.companyName} (${p.ticker}) is scheduled to report its next quarterly earnings on ${p.nextEarningsDate}. The full earnings calendar with EPS and revenue estimates is available on PreMarketPrice's earnings calendar.`,
    });
  }

  if (p.healthScore != null) {
    items.push({
      question: `How financially healthy is ${p.companyName}?`,
      answer: `${p.companyName} scores ${p.healthScore.toFixed(0)}/100 on PreMarketPrice's financial health score, which combines profitability, debt levels, margin stability and growth metrics from reported financial statements. See the full breakdown on the ${p.ticker} analysis page.`,
    });
  }

  items.push({
    question: `Where can I track ${p.ticker} pre-market moves and history?`,
    answer: `PreMarketPrice tracks ${p.ticker} during the pre-market session (4:00 AM – 9:30 AM ET) with live price, percentage change and market-cap moves. Significant historical pre-market moves for ${p.ticker} are listed on this page under Recent Market Moves.`,
  });

  return items;
}

export function TickerFaqSection(props: TickerFaqProps) {
  const faqItems = buildTickerFaq(props);

  return (
    <section className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Frequently asked questions about {props.ticker} stock
      </h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {faqItems.map((item) => (
          <div key={item.question} className="py-3 first:pt-0 last:pb-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
              {item.question}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
              {item.answer}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
        Answers are generated from the latest available data shown on this page and are for informational purposes only — not investment advice.
      </p>
    </section>
  );
}
