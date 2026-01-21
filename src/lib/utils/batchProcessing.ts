/**
 * Batch Processing Utilities
 * Generic batch processing with concurrency limits and success/failure tracking
 */

export interface BatchResult {
  success: number;
  failed: number;
}

/**
 * Process batch of items with concurrency limit
 * Returns count of successful and failed items
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<boolean>,
  batchSize: number = 50,
  concurrencyLimit: number = 10,
  onBatchProgress?: (batchNum: number, totalBatches: number, batchSize: number) => void
): Promise<BatchResult> {
  let success = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);
    
    if (onBatchProgress) {
      onBatchProgress(batchNum, totalBatches, batch.length);
    } else {
      console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
    }

    // Process with concurrency limit
    for (let j = 0; j < batch.length; j += concurrencyLimit) {
      const concurrentBatch = batch.slice(j, j + concurrencyLimit);
      const results = await Promise.allSettled(
        concurrentBatch.map(item => processor(item))
      );

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
          const item = concurrentBatch[index];
          console.warn(`Failed to process ${item}:`, result.status === 'rejected' ? result.reason : 'Unknown error');
        }
      });

      // Small delay between concurrent batches to avoid rate limiting
      if (j + concurrencyLimit < batch.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return { success, failed };
}
