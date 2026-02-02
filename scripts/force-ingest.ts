
import { ingestBatch } from '../src/workers/polygonWorker';
import { getAllTrackedTickers } from '../src/lib/utils/universeHelpers';
import { logger } from '../src/lib/utils/logger';

async function main() {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    console.error("❌ POLYGON_API_KEY not set");
    process.exit(1);
  }

  console.log("🚀 Starting FORCE ingest (bypassing timestamp checks)...");

  // Get all tickers
  const tickers = await getAllTrackedTickers();
  console.log(`📊 Found ${tickers.length} tickers to force update.`);

  const BATCH_SIZE = 50;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(tickers.length / BATCH_SIZE)}...`);

    // Force = true
    await ingestBatch(batch, apiKey, true);

    // Rate limit
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("✅ Force ingest complete.");
}

main().catch(console.error);
