import { getProjectTickers } from '@/data/defaultTickers';
import { getFinnhubClient, FinnhubEarningsResponse } from '@/lib/clients/finnhubClient';

export interface EarningsItemFull {
  ticker: string;
  companyName: string;
  time: string; // 'bmo' | 'amc' | 'dmh'
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprise: number | null;
  surprisePercent: number | null;
}

interface ProcessedEarnings {
  preMarket: string[];
  afterMarket: string[];
  totalFound: number;
  date: string;
  items?: EarningsItemFull[];
}

async function fetchFinnhubEarningsCalendar(date: string): Promise<FinnhubEarningsResponse> {
  const client = getFinnhubClient();
  const data = await client.fetchEarningsCalendar(date, date);
  return data || { earningsCalendar: [] };
}

/**
 * Finnhub fallback used by yahooFinanceScraper.checkEarningsForOurTickers.
 * Returns which of our tickers report on the given date.
 */
export async function checkEarningsForOurTickers(date: string, project: string = 'pmp'): Promise<ProcessedEarnings> {
  const ourTickers = getProjectTickers(project);
  const earningsData = await fetchFinnhubEarningsCalendar(date);

  const ourEarnings = earningsData.earningsCalendar?.filter(
    earning => ourTickers.includes(earning.symbol)
  ) || [];

  const preMarket: string[] = [];
  const afterMarket: string[] = [];
  const items: EarningsItemFull[] = [];

  for (const earning of ourEarnings) {
    const time = earning.time || 'amc';
    if (time === 'bmo') {
      preMarket.push(earning.symbol);
    } else {
      afterMarket.push(earning.symbol);
    }
    items.push({
      ticker: earning.symbol,
      companyName: earning.symbol,
      time,
      epsEstimate: earning.epsEstimate ?? null,
      epsActual: earning.epsActual ?? null,
      revenueEstimate: earning.revenueEstimate ?? null,
      revenueActual: earning.revenueActual ?? null,
      surprise: earning.surprise ?? null,
      surprisePercent: earning.surprisePercent ?? null,
    });
  }

  return {
    preMarket,
    afterMarket,
    totalFound: ourEarnings.length,
    date,
    items
  };
}
