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
  // OPTIMIZATION: Prefetch len top 20 pre mobile (rýchlejšie načítanie)
  // Heatmap má vlastné API, takže stocks API môže byť menší
  const project = 'pmp'; // Default project, could be dynamic based on headers/host
  const topTickers = getProjectTickers(project, 20); // Reduced from 30 to 20 for faster mobile load
  
  let initialData: any[] = [];
  
  try {
    logger.ssr('Fetching initial data for Top 20 tickers (mobile optimized)...');
    const { data } = await getStocksData(topTickers, project);
    initialData = data;
    logger.ssr(`Loaded ${initialData.length} stocks`);
  } catch (error) {
    logger.error('SSR Error fetching initial data', error, { project, tickerCount: topTickers.length });
    // Continue with empty initialData - client side will handle fallback
  }

  return <HomePage initialData={initialData} />;
}
