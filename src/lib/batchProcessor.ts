/**
 * Batch processor with concurrency limit
 * Processes items in parallel with a maximum concurrency limit
 */

export async function processBatchWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number = 10,
  delayBetweenBatches: number = 100
): Promise<R[]> {
  const results: R[] = [];
  const errors: Array<{ item: T; error: Error }> = [];

  // Process items in batches
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchIndex = Math.floor(i / concurrency);

    // Add delay between batches (except first batch)
    if (batchIndex > 0 && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }

    // Process batch in parallel
    const batchPromises: Promise<R | null>[] = batch.map((item, batchItemIndex) => {
      const globalIndex = i + batchItemIndex;
      return processor(item, globalIndex).catch((error) => {
        errors.push({ item, error: error instanceof Error ? error : new Error(String(error)) });
        return null;
      });
    });

    const batchResults = await Promise.all(batchPromises);

    // Filter out null results (errors)
    const validResults = batchResults.filter((result): result is Awaited<R> => result !== null);
    results.push(...(validResults as R[]));
  }

  if (errors.length > 0) {
    console.warn(`⚠️ ${errors.length} items failed in batch processing`);
  }

  return results;
}

/**
 * Process items with rate limiting (respects API rate limits)
 */
export async function processWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  requestsPerSecond: number = 5,
  delayBetweenRequests: number = 200
): Promise<Array<{ item: T; result: R | null; error?: Error }>> {
  const results: Array<{ item: T; result: R | null; error?: Error }> = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    // Add delay between requests (except first)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
    }

    try {
      const result = await processor(item);
      results.push({ item, result });
    } catch (error) {
      results.push({
        item,
        result: null,
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  return results;
}

