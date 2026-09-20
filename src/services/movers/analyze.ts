/**
 * Movers 2.0 — orchestrator.
 *
 * For the current top movers, gathers deterministic evidence
 * (EarningsCalendar ±3d, Finnhub company-news, Finnhub upgrade/downgrade),
 * classifies + ranks catalysts, attaches market/sector context and the
 * persisted PMP pillar profile, and returns a MoverAnalysis per symbol.
 *
 * Rate-limit strategy: per-ticker Finnhub payloads are Redis-cached
 * (news 15min, recommendations 30min); universe stats are one DB query.
 * All external failures degrade to channel-level 'unavailable' — never
 * to a fabricated "no catalyst".
 */
import { prisma } from '@/lib/db/prisma';
import { getCachedData, setCachedData } from '@/lib/redis/operations';
import { FINNHUB_API_KEY } from '@/lib/clients/finnhubClient';
import {
    CatalystCandidate, CatalystResult, CatalystType, EvidenceItem,
    attributeMove, buildInterpretation, catalystLabel, classifyHeadline,
    confidenceFor, rankCatalysts, sigmaLevel, SigmaLevel,
} from './classify';

const NEWS_CACHE_TTL = 15 * 60;       // 15 min
const RECS_CACHE_TTL = 30 * 60;       // 30 min
const NEWS_WINDOW_DAYS = 3;
const MAX_DEEP_ANALYZE = 20;          // top-N get catalyst detection

export interface MoverPillars {
    valuation: number | null;
    growth: number | null;
    profitability: number | null;
    health: number | null;
    quality: number | null;
    overall: number | null;
    ewScore: number | null;
    ewMaxPossible: number | null;
}

export interface MoverAnalysis {
    symbol: string;
    changePct: number | null;
    zScore: number | null;
    rvol: number | null;
    sigmaLevel: SigmaLevel;
    marketChangePct: number | null;
    sectorChangePct: number | null;
    excessMovePct: number | null;
    attribution: ReturnType<typeof attributeMove>['attribution'];
    catalyst: CatalystResult;
    pillars: MoverPillars | null;
    analyzedAt: string;
}

// ─── Universe / sector context ──────────────────────────────────────────────
function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export async function computeUniverseContext(): Promise<{
    marketChangePct: number | null;
    sectorChangePct: Map<string, number>;
}> {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await prisma.ticker.findMany({
        where: { lastPriceUpdated: { gte: dayAgo }, lastChangePct: { not: null } },
        select: { sector: true, lastChangePct: true },
    });
    const bySector = new Map<string, number[]>();
    const all: number[] = [];
    for (const r of rows) {
        if (r.lastChangePct === null) continue;
        all.push(r.lastChangePct);
        if (r.sector) {
            const arr = bySector.get(r.sector) ?? [];
            arr.push(r.lastChangePct);
            bySector.set(r.sector, arr);
        }
    }
    const sectorChangePct = new Map<string, number>();
    for (const [sec, arr] of bySector) {
        if (arr.length >= 3) { // tiny sectors aren't a reliable comp
            const m = median(arr);
            if (m !== null) sectorChangePct.set(sec, m);
        }
    }
    return { marketChangePct: median(all), sectorChangePct };
}

// ─── Finnhub fetchers (cached) ──────────────────────────────────────────────
interface FinnhubNewsItem {
    id: number; headline: string; summary?: string; source?: string;
    url?: string; datetime: number; category?: string;
}

async function fetchCompanyNews(symbol: string): Promise<FinnhubNewsItem[] | 'unavailable'> {
    if (!FINNHUB_API_KEY) return 'unavailable';
    const cacheKey = `movers:news:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached && Array.isArray(cached)) return cached as FinnhubNewsItem[];
    } catch { /* cache miss is fine */ }

    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - NEWS_WINDOW_DAYS * 86400_000).toISOString().split('T')[0];
        const res = await fetch(
            `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`,
            { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return 'unavailable';
        const data = await res.json();
        const items = Array.isArray(data) ? data.slice(0, 15) : [];
        try { await setCachedData(cacheKey, items, NEWS_CACHE_TTL); } catch { }
        return items;
    } catch {
        return 'unavailable';
    }
}

interface FinnhubUpgradeRow {
    symbol: string; gradeTime?: number;
    fromGrade?: string; toGrade?: string; company?: string; action?: string;
}

const GRADE_TO_TYPE: Record<string, CatalystType> = {
    up: 'analyst_upgrade', down: 'analyst_downgrade', main: 'analyst_action',
    init: 'analyst_action', reit: 'analyst_action',
};

async function fetchAnalystActions(symbol: string): Promise<FinnhubUpgradeRow[] | 'unavailable'> {
    if (!FINNHUB_API_KEY) return 'unavailable';
    const cacheKey = `movers:analyst:${symbol}`;
    try {
        const cached = await getCachedData(cacheKey);
        if (cached && Array.isArray(cached)) return cached as FinnhubUpgradeRow[];
    } catch { }

    try {
        const to = new Date().toISOString().split('T')[0];
        const from = new Date(Date.now() - NEWS_WINDOW_DAYS * 86400_000).toISOString().split('T')[0];
        const res = await fetch(
            `https://finnhub.io/api/v1/stock/upgrade-downgrade?symbol=${symbol}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`,
            { signal: AbortSignal.timeout(5000) },
        );
        if (!res.ok) return 'unavailable';
        const data = await res.json();
        const items = Array.isArray(data) ? data.slice(0, 10) : [];
        try { await setCachedData(cacheKey, items, RECS_CACHE_TTL); } catch { }
        return items;
    } catch {
        return 'unavailable';
    }
}

// ─── Catalyst detection per symbol ──────────────────────────────────────────
interface MoverInput {
    symbol: string;
    sector: string | null;
    changePct: number | null;
    zScore: number | null;
    rvol: number | null;
}

async function detectCatalyst(
    mover: MoverInput,
    attribution: ReturnType<typeof attributeMove>,
    now: Date,
): Promise<CatalystResult> {
    const dir = (mover.changePct ?? 0) >= 0 ? 'up' : 'down';
    const candidates: CatalystCandidate[] = [];
    let sawUnavailable = false;

    // 1. EarningsCalendar — structured, local, free. ±3d window.
    try {
        const rows = await prisma.earningsCalendar.findMany({
            where: {
                ticker: mover.symbol,
                date: { gte: new Date(now.getTime() - 3 * 86400_000), lte: new Date(now.getTime() + 86400_000) },
            },
            orderBy: { date: 'desc' },
            take: 3,
        });
        for (const row of rows) {
            const eps = row.epsSurprisePercent;
            const rev = row.revenueSurprisePercent;
            let type: CatalystType = 'earnings_release';
            if (eps !== null && eps !== undefined) {
                const beat = eps > 0 && (rev === null || rev === undefined || rev >= 0);
                const miss = eps < 0 && (rev === null || rev === undefined || rev <= 0);
                type = beat ? 'earnings_beat' : miss ? 'earnings_miss' : 'earnings_mixed';
            }
            const headline = eps !== null && eps !== undefined
                ? `Earnings ${row.date.toISOString().slice(0, 10)}: EPS surprise ${eps >= 0 ? '+' : ''}${eps.toFixed(1)}%${rev !== null && rev !== undefined ? `, revenue ${rev >= 0 ? '+' : ''}${rev.toFixed(1)}%` : ''}`
                : `Earnings released ${row.date.toISOString().slice(0, 10)}`;
            candidates.push({
                type,
                companySpecific: true,
                ageSeconds: Math.max(0, (now.getTime() - row.date.getTime()) / 1000),
                evidence: {
                    source: 'earnings-calendar',
                    headline,
                    url: null,
                    publishedAt: row.date.toISOString(),
                    catalystType: type,
                },
            });
        }
    } catch {
        sawUnavailable = true;
    }

    // 2. Finnhub company news — headline keyword classification.
    const news = await fetchCompanyNews(mover.symbol);
    if (news === 'unavailable') {
        sawUnavailable = true;
    } else {
        for (const item of news) {
            const type = classifyHeadline(item.headline);
            if (type === 'news_other') continue; // generic news isn't evidence
            const pub = new Date(item.datetime * 1000);
            candidates.push({
                type,
                companySpecific: true,
                ageSeconds: Math.max(0, (now.getTime() - pub.getTime()) / 1000),
                evidence: {
                    source: 'finnhub-news',
                    headline: item.headline,
                    url: item.url ?? null,
                    publishedAt: pub.toISOString(),
                    catalystType: type,
                },
            });
        }
    }

    // 3. Analyst upgrades/downgrades — explicit actions, not trends.
    const actions = await fetchAnalystActions(mover.symbol);
    if (actions === 'unavailable') {
        sawUnavailable = true;
    } else {
        for (const a of actions) {
            const type = GRADE_TO_TYPE[a.action ?? ''] ?? 'analyst_action';
            const ts = a.gradeTime ? new Date(a.gradeTime * 1000) : now;
            candidates.push({
                type,
                companySpecific: true,
                ageSeconds: Math.max(0, (now.getTime() - ts.getTime()) / 1000),
                evidence: {
                    source: 'finnhub-recommendation',
                    headline: `${a.company ?? 'Analyst'}: ${a.fromGrade ?? '?'} → ${a.toGrade ?? '?'}`,
                    url: null,
                    publishedAt: ts.toISOString(),
                    catalystType: type,
                },
            });
        }
    }

    // 4. Sector/market attribution as contextual catalyst.
    if (attribution.attribution === 'sector') {
        candidates.push({
            type: 'sector_move', companySpecific: false, ageSeconds: 0,
            evidence: { source: 'computed', headline: 'Sector-wide move', publishedAt: now.toISOString(), catalystType: 'sector_move' },
        });
    } else if (attribution.attribution === 'market') {
        candidates.push({
            type: 'market_move', companySpecific: false, ageSeconds: 0,
            evidence: { source: 'computed', headline: 'Market-wide move', publishedAt: now.toISOString(), catalystType: 'market_move' },
        });
    }

    // 5. Volume-only anomaly when nothing else explains the move.
    if ((mover.rvol ?? 0) >= 3) {
        candidates.push({
            type: 'unusual_volume', companySpecific: false, ageSeconds: 0,
            evidence: { source: 'computed', headline: `Volume ${mover.rvol!.toFixed(1)}× normal`, publishedAt: now.toISOString(), catalystType: 'unusual_volume' },
        });
    }

    if (candidates.length === 0) {
        return {
            type: sawUnavailable ? 'unavailable' : 'none',
            status: sawUnavailable ? 'unavailable' : 'none',
            confidence: 'low',
            label: sawUnavailable ? 'Catalyst data unavailable' : 'No obvious catalyst detected',
            explanation: '',
            evidence: [],
        };
    }

    const ranked = rankCatalysts(candidates, dir);
    const top = ranked[0]!;
    const confidence = confidenceFor(top.score, top.companySpecific);
    const catalyst: CatalystResult = {
        type: top.type,
        confidence,
        status: 'found',
        label: catalystLabel(top.type),
        explanation: '',
        evidence: ranked.slice(0, 2).map(c => c.evidence),
    };
    return catalyst;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function analyzeMovers(inputs: MoverInput[]): Promise<Map<string, MoverAnalysis>> {
    const results = new Map<string, MoverAnalysis>();
    if (inputs.length === 0) return results;

    const now = new Date();
    const ctx = await computeUniverseContext();

    // Pillars + EW join — one batch query each.
    const symbols = inputs.map(i => i.symbol);
    const [caches, ews] = await Promise.all([
        prisma.analysisCache.findMany({
            where: { symbol: { in: symbols } },
            select: {
                symbol: true, valuationScore: true, growthScore: true,
                profitabilityScore: true, healthScore: true, qualityScore: true, overallScore: true,
            },
        }),
        prisma.ewScoreSnapshot.findMany({
            where: { symbol: { in: symbols } },
            orderBy: { asOfDate: 'desc' },
            select: { symbol: true, totalScore: true, maxPossible: true },
        }),
    ]);
    const cacheBySymbol = new Map(caches.map(c => [c.symbol, c]));
    // Latest snapshot per symbol (rows arrive desc — first wins).
    const ewBySymbol = new Map<string, { totalScore: number; maxPossible: number }>();
    for (const e of ews) {
        if (!ewBySymbol.has(e.symbol)) ewBySymbol.set(e.symbol, e);
    }

    // Deep catalyst analysis only for the top-N by significance —
    // the rest get context fields but catalyst 'none' placeholder.
    const ranked = [...inputs].sort((a, b) =>
        (Math.abs(b.zScore ?? 0) + (b.rvol ?? 0)) - (Math.abs(a.zScore ?? 0) + (a.rvol ?? 0)));
    const deepSet = new Set(ranked.slice(0, MAX_DEEP_ANALYZE).map(i => i.symbol));

    for (const m of inputs) {
        const sectorChangePct = m.sector ? (ctx.sectorChangePct.get(m.sector) ?? null) : null;
        const attr = attributeMove(m.changePct, sectorChangePct, ctx.marketChangePct);
        const catalyst = deepSet.has(m.symbol)
            ? await detectCatalyst(m, attr, now)
            : {
                type: 'none' as CatalystType, status: 'none' as const, confidence: 'low' as const,
                label: 'No obvious catalyst detected', explanation: '', evidence: [],
            };
        catalyst.explanation = buildInterpretation({
            changePct: m.changePct, zScore: m.zScore, rvol: m.rvol,
            attribution: attr.attribution, excessMovePct: attr.excessMovePct,
            sectorChangePct, marketChangePct: ctx.marketChangePct, catalyst,
        });

        const c = cacheBySymbol.get(m.symbol);
        const ew = ewBySymbol.get(m.symbol);
        const pillars: MoverPillars | null = c ? {
            valuation: c.valuationScore, growth: c.growthScore,
            profitability: c.profitabilityScore, health: c.healthScore,
            quality: c.qualityScore, overall: c.overallScore,
            ewScore: ew ? Math.round(ew.totalScore) : null,
            ewMaxPossible: ew ? Math.round(ew.maxPossible) : null,
        } : null;

        results.set(m.symbol, {
            symbol: m.symbol,
            changePct: m.changePct,
            zScore: m.zScore,
            rvol: m.rvol,
            sigmaLevel: sigmaLevel(m.zScore),
            marketChangePct: ctx.marketChangePct,
            sectorChangePct,
            excessMovePct: attr.excessMovePct,
            attribution: attr.attribution,
            catalyst,
            pillars,
            analyzedAt: now.toISOString(),
        });
    }
    return results;
}
