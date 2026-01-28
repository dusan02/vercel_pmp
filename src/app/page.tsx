import HomePage from './HomePage';
import { getStocksData } from '@/lib/server/stockService';
import { getEarningsForDate } from '@/lib/server/earningsService';
import { getProjectTickers } from '@/data/defaultTickers';
import { logger } from '@/lib/utils/logger';
import { getDateET, createETDate } from '@/lib/utils/dateET';

// Force dynamic to ensure fresh data on every request (SSR)
export const dynamic = 'force-dynamic';
// Revalidate every 60 seconds as a fallback
export const revalidate = 60;

export default async function Page() {
  // Server-side data fetching for initial render (SSR)
  // OPTIMIZATION: Prefetch len top 20 pre mobile (rýchlejšie načítanie)
  // Heatmap má vlastné API, takže stocks API môže byť menší
  const project = 'pmp'; // Default project, could be dynamic based on headers/host
  const topTickers = getProjectTickers(project, 20); // Reduced from 30 to 20 for faster mobile load

  let initialData: any[] = [];
  let initialEarningsData = null;

  try {
    const todayET = getDateET(new Date());

    logger.ssr('Fetching initial data for Top 20 tickers and Earnings...');

    // Parallel fetch for speed
    const [stocksResult, earningsResult] = await Promise.allSettled([
      getStocksData(topTickers, project),
      getEarningsForDate(todayET)
    ]);

    if (stocksResult.status === 'fulfilled') {
      initialData = stocksResult.value.data;
      logger.ssr(`Loaded ${initialData.length} stocks`);
    } else {
      logger.error('SSR Error fetching stocks', stocksResult.reason);
    }

    if (earningsResult.status === 'fulfilled') {
      initialEarningsData = earningsResult.value;
      logger.ssr(`Loaded Earnings for ${todayET}`);
    } else {
      logger.error('SSR Error fetching earnings', earningsResult.reason);
    }

  } catch (error) {
    logger.error('SSR Error fetching initial data', error, { project, tickerCount: topTickers.length });
    // Continue with empty initialData - client side will handle fallback
  }

  return <HomePage initialData={initialData} initialEarningsData={initialEarningsData} />;
}

