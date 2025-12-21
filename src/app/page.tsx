import HomePage from './HomePage';
import { getStocksData } from '@/lib/server/stockService';
import { getProjectTickers } from '@/data/defaultTickers';
import { logger } from '@/lib/utils/logger';

// Force dynamic to ensure fresh data on every request (SSR)
export const dynamic = 'force-dynamic';
// Revalidate every 60 seconds as a fallback
export const revalidate = 60;

export default async function Page() {
  // Server-side data fetching for initial render (SSR)
  const project = 'pmp'; // Default project, could be dynamic based on headers/host
  const top50Tickers = getProjectTickers(project, 50);
  
  let initialData: any[] = [];
  
  try {
    logger.ssr('Fetching initial data for Top 50 tickers...');
    const { data } = await getStocksData(top50Tickers, project);
    initialData = data;
    logger.ssr(`Loaded ${initialData.length} stocks`);
  } catch (error) {
    logger.error('SSR Error fetching initial data', error, { project, tickerCount: top50Tickers.length });
    // Continue with empty initialData - client side will handle fallback
  }

  return <HomePage initialData={initialData} />;
}
