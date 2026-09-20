/**
 * Movers 2.0 — deterministic classification layer.
 *
 * Pure functions (no DB/network) so the whole module is unit-testable:
 *   - sigmaLevel: |z|-score → normal/unusual/very/extreme
 *   - attributeMove: stock vs sector vs market attribution + excess move
 *   - classifyHeadline: keyword taxonomy for news/evidence items
 *   - rankCatalysts: deterministic evidence ranking + confidence
 *   - buildInterpretation: template text from structured facts
 *
 * The LLM prose layer (aiMoversService) stays separate — this module is the
 * record-of-truth for category/confidence/evidence.
 */

// ─── Sigma levels (configurable thresholds) ─────────────────────────────────
export const SIGMA_THRESHOLDS = {
    unusual: 2.0,
    veryUnusual: 3.0,
    extreme: 5.0,
} as const;

export type SigmaLevel = 'normal' | 'unusual' | 'very_unusual' | 'extreme';

export function sigmaLevel(z: number | null | undefined): SigmaLevel {
    if (z === null || z === undefined || !Number.isFinite(z)) return 'normal';
    const a = Math.abs(z);
    if (a >= SIGMA_THRESHOLDS.extreme) return 'extreme';
    if (a >= SIGMA_THRESHOLDS.veryUnusual) return 'very_unusual';
    if (a >= SIGMA_THRESHOLDS.unusual) return 'unusual';
    return 'normal';
}

export const SIGMA_LABELS: Record<SigmaLevel, string> = {
    normal: 'Normal',
    unusual: 'Unusual',
    very_unusual: 'Very unusual',
    extreme: 'Extreme',
};

// ─── Attribution: stock vs sector vs market ─────────────────────────────────
export type MoveAttribution = 'stock' | 'sector' | 'market' | 'mixed' | 'unknown';

export interface AttributionResult {
    attribution: MoveAttribution;
    /** Stock move minus the better of sector/market — the idiosyncratic part. */
    excessMovePct: number | null;
}

/**
 * How much of the move is unexplained by sector/market drift.
 * excess = stock − sector (sector is the tighter comp; falls back to market).
 *
 * Attribution rules (on |excess| and relative share of the move):
 *   - |stock − sector| ≤ 1.5pp and |sector − market| ≥ 1.5pp → sector-driven
 *   - |stock − market| ≤ 1.5pp → market-driven
 *   - otherwise → stock-specific (mixed when sector also moved materially)
 */
export function attributeMove(
    stockChangePct: number | null | undefined,
    sectorChangePct: number | null | undefined,
    marketChangePct: number | null | undefined,
): AttributionResult {
    const stock = stockChangePct ?? null;
    const sector = sectorChangePct ?? null;
    const market = marketChangePct ?? null;
    if (stock === null || !Number.isFinite(stock)) {
        return { attribution: 'mixed', excessMovePct: null };
    }

    const comp = sector ?? market; // tighter comp preferred
    const excess = comp !== null ? stock - comp : null;

    const SECTOR_BAND = 1.5;
    if (sector !== null && market !== null) {
        const sectorSpread = Math.abs(sector - market);
        const stockVsSector = Math.abs(stock - sector);
        const stockVsMarket = Math.abs(stock - market);
        if (stockVsSector <= SECTOR_BAND && sectorSpread >= SECTOR_BAND) {
            return { attribution: 'sector', excessMovePct: excess };
        }
        if (stockVsMarket <= SECTOR_BAND) {
            return { attribution: 'market', excessMovePct: excess };
        }
    }
    if (excess !== null && Math.abs(excess) <= SECTOR_BAND) {
        return { attribution: sector !== null ? 'sector' : 'market', excessMovePct: excess };
    }
    // Material sector drift that explains a real share of the move → mixed.
    // A +1.7% sector behind a +8.4% stock is a tailwind, not a driver (20% of
    // the move) — require sector ≥2% AND ≥30% of the stock's magnitude.
    if (sector !== null && Math.abs(sector) >= 2 && Math.abs(excess!) >= SECTOR_BAND
        && Math.abs(sector) >= 0.3 * Math.abs(stock)) {
        return { attribution: 'mixed', excessMovePct: excess };
    }
    // No sector/market comp at all → don't claim 'stock-specific' (overclaim).
    if (excess === null) {
        return { attribution: 'unknown', excessMovePct: null };
    }
    return { attribution: 'stock', excessMovePct: excess };
}

// ─── Catalyst taxonomy ──────────────────────────────────────────────────────
export type CatalystType =
    | 'earnings_beat' | 'earnings_miss' | 'earnings_mixed' | 'earnings_release'
    | 'guidance_raised' | 'guidance_lowered'
    | 'analyst_upgrade' | 'analyst_downgrade' | 'analyst_action'
    | 'acquisition' | 'partnership' | 'contract' | 'product' | 'financing'
    | 'restructuring' | 'management' | 'legal' | 'news_other'
    | 'sector_move' | 'market_move' | 'unusual_volume'
    | 'none' | 'unavailable';

export type Confidence = 'high' | 'medium' | 'low';

export interface EvidenceItem {
    source: string;        // 'finnhub-news' | 'finnhub-recommendation' | 'earnings-calendar' | 'computed'
    headline: string;
    url?: string | null;
    publishedAt: string;   // ISO
    catalystType: CatalystType;
}

export interface CatalystResult {
    type: CatalystType;
    confidence: Confidence;
    /** One-line factual label, e.g. "Earnings beat + raised guidance". */
    label: string;
    /** Template-generated interpretation from structured facts. */
    explanation: string;
    evidence: EvidenceItem[];
    /** 'none' = searched, nothing found. 'unavailable' = source failed. */
    status: 'found' | 'none' | 'unavailable';
}

// ─── Headline keyword classification ────────────────────────────────────────
// Order matters: first match wins; more specific patterns earlier.
const HEADLINE_RULES: [RegExp, CatalystType][] = [
    [/\b(guidance|outlook|forecast).*(rais|lift|boost|upgrad|increas|higher|above)/i, 'guidance_raised'],
    [/\b(guidance|outlook|forecast).*(lower|cut|slash|reduc|below|trim|downgrad)/i, 'guidance_lowered'],
    [/\b(rais|lift|boost|increas).*(guidance|outlook|forecast)/i, 'guidance_raised'],
    [/\b(lower|cut|slash|reduc|trim).*(guidance|outlook|forecast)/i, 'guidance_lowered'],
    [/\b(earnings|eps|profit|results|quarter).*(beat|top|exceed|surpass|above)/i, 'earnings_beat'],
    [/\b(earnings|eps|profit|results|quarter).*(miss|falls? short|below|disappoint)/i, 'earnings_miss'],
    [/\b(upgrade|upgraded|overweight|outperform|buy rating|price target (raised|increased|higher|boosted|lifted))/i, 'analyst_upgrade'],
    [/\b(downgrade|downgraded|underweight|underperform|sell rating|price target (cut|lowered|reduced|slashed))/i, 'analyst_downgrade'],
    [/\b(initiated|initiation|coverage).*(buy|overweight|outperform|neutral|sell|underperform)/i, 'analyst_action'],
    [/\b(acqui[rs]|merger|merge with|takeover|buyout|to buy|to acquire)/i, 'acquisition'],
    [/\b(partnership|partners with|collaborat|alliance|teams up|joint venture)/i, 'partnership'],
    [/\b(contract|deal|order|agreement|award).*(worth|valued|billion|million|\$)/i, 'contract'],
    [/\b(launch|unveil|introduc|announce|reveal|roll out).*(product|chip|model|platform|service|device|phone|ai)/i, 'product'],
    [/\b(financing|offering|notes|bond|debt|credit facility|share sale|stock offering|dilut)/i, 'financing'],
    [/\b(restructur|layoff|job cut|cost cut|workforce|downsiz)/i, 'restructuring'],
    [/\b(ceo|cfo|chief|president|executive|board).*(resign|steps? down|appoint|name|hire|depart|exit|fired|oust)/i, 'management'],
    [/\b(fda|ftc|doj|sec|regulator|antitrust|lawsuit|sue|court|probe|investigat|fine|penalty|ban)/i, 'legal'],
    [/\b(earnings|eps|revenue|quarterly results|q[1-4] results)/i, 'earnings_release'],
];

export function classifyHeadline(headline: string | null | undefined): CatalystType {
    if (!headline) return 'news_other';
    for (const [re, type] of HEADLINE_RULES) {
        if (re.test(headline)) return type;
    }
    return 'news_other';
}

// ─── Catalyst ranking ───────────────────────────────────────────────────────
export interface CatalystCandidate {
    type: CatalystType;
    evidence: EvidenceItem;
    /** Seconds between evidence publication and the move snapshot (lower=better). */
    ageSeconds: number;
    /** Company-specific (vs sector/market-wide). */
    companySpecific: boolean;
}

const TYPE_BASE_SCORE: Record<string, number> = {
    earnings_beat: 100, earnings_miss: 100, earnings_mixed: 95, earnings_release: 85,
    guidance_raised: 95, guidance_lowered: 95,
    acquisition: 90, legal: 80, management: 70,
    analyst_upgrade: 65, analyst_downgrade: 65, analyst_action: 55,
    partnership: 60, contract: 60, product: 55, financing: 55, restructuring: 65,
    news_other: 40,
    sector_move: 30, market_move: 20, unusual_volume: 15,
};

/**
 * Deterministic ranking:
 *   score = typeBase + proximityBonus − nonCompanyPenalty − directionMismatchPenalty
 * Proximity: <30min +25, <2h +15, <6h +8, <24h +3, else 0.
 * Direction mismatch (e.g. "beat" headline with a down move) −55 — strong
 * enough that an unrelated volume/sector signal wins instead.
 */
export function rankCatalysts(
    candidates: CatalystCandidate[],
    moveDirection: 'up' | 'down',
): (CatalystCandidate & { score: number })[] {
    const POSITIVE: CatalystType[] = ['earnings_beat', 'guidance_raised', 'analyst_upgrade', 'acquisition', 'partnership', 'contract', 'product'];
    const NEGATIVE: CatalystType[] = ['earnings_miss', 'guidance_lowered', 'analyst_downgrade', 'legal', 'restructuring', 'financing'];

    return candidates
        .map(c => {
            let score = TYPE_BASE_SCORE[c.type] ?? 30;
            const ageMin = c.ageSeconds / 60;
            score += ageMin <= 30 ? 25 : ageMin <= 120 ? 15 : ageMin <= 360 ? 8 : ageMin <= 1440 ? 3 : 0;
            if (!c.companySpecific) score -= 10;
            const positive = POSITIVE.includes(c.type);
            const negative = NEGATIVE.includes(c.type);
            if ((positive && moveDirection === 'down') || (negative && moveDirection === 'up')) {
                score -= 55;
            }
            return { ...c, score };
        })
        .sort((a, b) => b.score - a.score);
}

export function confidenceFor(score: number, companySpecific: boolean): Confidence {
    if (score >= 100 && companySpecific) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
}

// ─── Interpretation templates ───────────────────────────────────────────────
const CATALYST_LABELS: Record<CatalystType, string> = {
    earnings_beat: 'Earnings beat',
    earnings_miss: 'Earnings miss',
    earnings_mixed: 'Mixed earnings',
    earnings_release: 'Earnings release',
    guidance_raised: 'Guidance raised',
    guidance_lowered: 'Guidance lowered',
    analyst_upgrade: 'Analyst upgrade',
    analyst_downgrade: 'Analyst downgrade',
    analyst_action: 'Analyst action',
    acquisition: 'Acquisition / M&A',
    partnership: 'Partnership',
    contract: 'Major contract',
    product: 'Product announcement',
    financing: 'Financing',
    restructuring: 'Restructuring',
    management: 'Management change',
    legal: 'Legal / regulatory',
    news_other: 'Company news',
    sector_move: 'Sector-wide move',
    market_move: 'Market-wide move',
    unusual_volume: 'Unusual volume',
    none: 'No obvious catalyst',
    unavailable: 'Catalyst data unavailable',
};

export function catalystLabel(type: CatalystType): string {
    return CATALYST_LABELS[type];
}

export interface InterpretationCtx {
    changePct: number | null;
    zScore: number | null;
    rvol: number | null;
    attribution: MoveAttribution;
    excessMovePct: number | null;
    sectorChangePct: number | null;
    marketChangePct: number | null;
    catalyst: CatalystResult;
}

export function buildInterpretation(ctx: InterpretationCtx): string {
    const dir = (ctx.changePct ?? 0) >= 0 ? 'up' : 'down';
    const sigma = ctx.zScore !== null ? `${Math.abs(ctx.zScore).toFixed(1)}σ` : null;
    const vol = ctx.rvol !== null && ctx.rvol >= 1.5 ? `${ctx.rvol.toFixed(1)}× normal volume` : null;

    if (ctx.catalyst.status === 'unavailable') {
        return `The stock is ${dir} ${sigma ? `(${sigma} move)` : ''} — catalyst data temporarily unavailable.`;
    }
    if (ctx.catalyst.status === 'none' || ctx.catalyst.type === 'none') {
        const bits = [sigma ? `statistically ${sigma} move` : 'a large move', vol].filter(Boolean).join(' on ');
        return `The stock is making ${bits}, but no obvious company-specific catalyst was detected.`;
    }
    if (ctx.catalyst.type === 'sector_move') {
        return `Sector-driven move — the stock is moving largely with its sector${ctx.sectorChangePct !== null ? ` (${ctx.sectorChangePct >= 0 ? '+' : ''}${ctx.sectorChangePct.toFixed(1)}%)` : ''}; no major company-specific catalyst detected.`;
    }
    if (ctx.catalyst.type === 'market_move') {
        return 'Market-wide move — the stock is tracking broad market movement; no company-specific catalyst detected.';
    }

    const label = catalystLabel(ctx.catalyst.type).toLowerCase();
    const conf = ctx.catalyst.confidence;
    const prefix = conf === 'high' ? 'Likely catalyst' : conf === 'medium' ? 'Possible catalyst' : 'Weak signal';
    const excess = ctx.excessMovePct !== null && Math.abs(ctx.excessMovePct) >= 1.5
        ? `, ${Math.abs(ctx.excessMovePct).toFixed(1)}pp ${dir === 'up' ? 'above' : 'below'} its sector` : '';
    return `${prefix}: ${label}${excess}${vol ? `, on ${vol}` : ''}.`;
}
