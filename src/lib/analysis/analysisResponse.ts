import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { computeMetrics, fetchPeers, TICKER_SELECT } from '@/services/analysisCompute';

// In-memory dedup: prevents multiple concurrent background revalidations for the same symbol
const revalidating = new Set<string>();

const ANALYSIS_CACHE_TTL = 300; // 5 minutes

interface AnalysisResponseOptions {
    /** Secondary symbol for comparison responses (bypasses the Redis read). */
    compareSymbol?: string | null;
    /**
     * Origin used for the background stale-revalidation self-POST
     * (e.g. `http://127.0.0.1:3001`). When omitted, revalidation is skipped —
     * used by SSR callers that already compute fresh data.
     */
    origin?: string;
}

/**
 * Shared analysis pipeline — used by /api/analysis/[ticker] GET (HTTP layer
 * adds NextResponse/status) and by the analysis page SSR prefetch (same
 * Redis cache + compute path, no localhost hop).
 * Returns the JSON-serialisable response body, or null when the ticker has
 * no computable analysis. Errors propagate — callers choose 500 vs silent.
 */
export async function getAnalysisResponse(
    symbol: string,
    { compareSymbol = null, origin }: AnalysisResponseOptions = {}
): Promise<Record<string, any> | null> {
    // 1. Check Redis cache first (skip for compare requests — they need fresh data)
    if (!compareSymbol) {
        try {
            const cached = await getCachedData(`analysis:cache:${symbol}`);
            if (cached) {
                return cached as Record<string, any>;
            }
        } catch {}
    }

    // 2. Fetch ticker record once (shared select for computeMetrics + response)
    const tickerRecord = await prisma.ticker.findUnique({
        where: { symbol },
        select: TICKER_SELECT,
    });

    // 3. Compute metrics (pass tickerRecord to avoid duplicate DB query)
    const primary = await computeMetrics(symbol, tickerRecord);
    if (!primary) return null;

    // 4. Fetch peers
    const peers = await fetchPeers(symbol, tickerRecord?.sector ?? null);

    // 5. If compare requested, fetch secondary analysis
    if (compareSymbol) {
        const secondary = await computeMetrics(compareSymbol);
        return {
            primary: { ...primary, ticker: tickerRecord },
            secondary,
            peers
        };
    }

    // 6. Background revalidation: if cache is stale (> 7 days), trigger async refresh
    const analysisUpdatedAt = (primary as any)?.updatedAt;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (origin && analysisUpdatedAt && new Date(analysisUpdatedAt) < sevenDaysAgo && !revalidating.has(symbol)) {
        revalidating.add(symbol);
        // Timeout guard: a hung self-POST must not permanently occupy the
        // revalidating slot (it would block revalidation for this symbol).
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 120_000);
        fetch(`${origin}/api/analysis/${symbol}`, { method: 'POST', signal: abort.signal })
            .catch(() => {/* silent — background job */})
            .finally(() => {
                clearTimeout(timeout);
                revalidating.delete(symbol);
            });
    }

    // 7. Build response and cache it
    const response = { ...primary, ticker: tickerRecord, peers };
    try {
        await setCachedData(`analysis:cache:${symbol}`, response, ANALYSIS_CACHE_TTL);
    } catch {}

    return response;
}
