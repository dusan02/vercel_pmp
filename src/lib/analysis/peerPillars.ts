import { prisma } from '@/lib/db/prisma';

/**
 * Peer-median pillar scores for the radar overlay ("vs Semiconductors
 * median"). Medians over AnalysisCache — the materialized pillar scores the
 * nightly analysis backfill writes with the same model the page renders.
 * Industry when it has enough peers, else sector. In-process cache (1h):
 * one grouped query serves every ticker page in the sector.
 */
export interface PeerPillars {
    label: string;
    n: number;
    scores: Record<string, number>;
}

const MIN_INDUSTRY_PEERS = 8;
const MIN_SECTOR_PEERS = 5;
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: PeerPillars | null }>();

const FIELDS = [
    ['valuation', 'valuationScore'],
    ['growth', 'growthScore'],
    ['profitability', 'profitabilityScore'],
    ['health', 'healthScore'],
    ['quality', 'qualityScore'],
    ['moat', 'moatScore'],
] as const;

function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

async function compute(where: { sector?: string; industry?: string }, label: string, min: number): Promise<PeerPillars | null> {
    const rows = await prisma.analysisCache.findMany({
        where: { ticker: where, overallScore: { not: null } },
        select: {
            valuationScore: true, growthScore: true, profitabilityScore: true,
            healthScore: true, qualityScore: true, moatScore: true,
        },
    });
    if (rows.length < min) return null;
    const scores: Record<string, number> = {};
    for (const [key, field] of FIELDS) {
        const vals = rows.map(r => r[field]).filter((v): v is number => v != null && Number.isFinite(v));
        if (vals.length < min) return null;
        scores[key] = Math.round(median(vals));
    }
    return { label, n: rows.length, scores };
}

export async function getPeerPillars(sector: string | null, industry: string | null): Promise<PeerPillars | null> {
    const key = `${sector ?? ''}|${industry ?? ''}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    let value: PeerPillars | null = null;
    try {
        if (industry) value = await compute({ industry }, industry, MIN_INDUSTRY_PEERS);
        if (!value && sector) value = await compute({ sector }, sector, MIN_SECTOR_PEERS);
    } catch {
        value = null;
    }
    cache.set(key, { at: Date.now(), value });
    return value;
}
