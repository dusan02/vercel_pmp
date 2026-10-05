import { prisma } from '@/lib/db/prisma';
import { dedupeShareClasses } from '@/lib/companyNames';

/**
 * Related-opportunities engine — the internal discovery funnel.
 *
 * Combines several cheap DB signals into ≤6 labelled cross-links:
 *   1. Same-industry peers
 *   2. Stocks moving in the same sector today (mover context)
 *   3. Cheaper alternative (higher valuation pillar score in same sector)
 *   4. Similar fundamentals (similar overall score, same sector first)
 *
 * Reused on /analysis, /valuation, /financials and /premarket pages.
 * All scores come from the denormalized AnalysisCache columns — no JSON.
 */

export interface RelatedStock {
  symbol: string;
  name: string | null;
  changePct: number | null;
  /** Small context chip shown next to the ticker, e.g. "Z 4.2σ" or "Valuation 85". */
  badge: string | null;
}

export interface RelatedGroup {
  key: 'movers' | 'industry' | 'cheaper' | 'similar';
  label: string;
  items: RelatedStock[];
}

export interface RelatedOpportunities {
  sector: string | null;
  industry: string | null;
  groups: RelatedGroup[];
}

const MAX_TOTAL = 6;

// ---------------------------------------------------------------------------
// Pure assembly — unit-testable. First-seen wins across groups, capped.
// ---------------------------------------------------------------------------

export interface RelatedCandidates {
  sector: string | null;
  industry: string | null;
  movers: RelatedStock[];
  industryPeers: RelatedStock[];
  cheaper: RelatedStock[];
  similar: RelatedStock[];
}

export function assembleRelatedGroups(c: RelatedCandidates): RelatedOpportunities {
  const seen = new Set<string>();
  const take = (items: RelatedStock[], n: number) =>
    items.filter((i) => !seen.has(i.symbol) && (seen.add(i.symbol), true)).slice(0, n);

  const groups: RelatedGroup[] = ([
    {
      key: 'movers',
      label: c.sector ? `Moving today in ${c.sector}` : 'Moving today',
      items: take(c.movers, 2),
    },
    {
      key: 'industry',
      label: c.industry ? `More ${c.industry} stocks` : 'Same-industry stocks',
      items: take(c.industryPeers, 2),
    },
    {
      key: 'cheaper',
      label: 'Cheaper alternatives',
      items: take(c.cheaper, 1),
    },
    {
      key: 'similar',
      label: 'Similar fundamentals',
      items: take(c.similar, 1),
    },
  ] as RelatedGroup[]).filter((g) => g.items.length > 0);

  // Cap the combined card at MAX_TOTAL, keeping group order.
  let budget = MAX_TOTAL;
  for (const g of groups) {
    const keep = Math.min(g.items.length, budget);
    g.items = g.items.slice(0, keep);
    budget -= keep;
  }

  return { sector: c.sector, industry: c.industry, groups: groups.filter((g) => g.items.length > 0) };
}

// ---------------------------------------------------------------------------
// DB fetch — small indexed queries only. Anything failing degrades to fewer
// groups rather than an error (discovery must never break the host page).
// ---------------------------------------------------------------------------

export async function getRelatedOpportunities(symbol: string): Promise<RelatedOpportunities> {
  const empty: RelatedOpportunities = { sector: null, industry: null, groups: [] };
  try {
    const ticker = await prisma.ticker.findUnique({
      where: { symbol },
      select: { sector: true, industry: true },
    });
    if (!ticker?.sector || ticker.sector === 'Other') return empty;

    const sector = ticker.sector;
    const industry = ticker.industry && ticker.industry !== 'Other' ? ticker.industry : null;

    const self = await prisma.analysisCache.findUnique({
      where: { symbol },
      select: { overallScore: true, valuationScore: true },
    });

    const [moversRaw, industryRaw] = await Promise.all([
      sector === 'ETF'
        ? []
        : prisma.ticker.findMany({
            where: {
              sector,
              symbol: { not: symbol },
              OR: [{ moversReason: { not: null } }, { latestMoversZScore: { gte: 2 } }, { latestMoversZScore: { lte: -2 } }],
            },
            take: 8,
            select: { symbol: true, name: true, lastChangePct: true, latestMoversZScore: true },
          }),
      industry
        ? prisma.ticker.findMany({
            where: { industry, symbol: { not: symbol }, lastMarketCap: { gt: 0 }, analysisCache: { isNot: null } },
            orderBy: { lastMarketCap: 'desc' },
            take: 6,
            select: { symbol: true, name: true, lastChangePct: true },
          })
        : Promise.resolve([]),
    ]);

    // Sort movers by |change| — SQLite/Prisma can't order by abs().
    const movers: RelatedStock[] = moversRaw
      .sort((a, b) => Math.abs(b.lastChangePct ?? 0) - Math.abs(a.lastChangePct ?? 0))
      .map((m) => ({
        symbol: m.symbol,
        name: m.name,
        changePct: m.lastChangePct,
        badge:
          m.latestMoversZScore != null && Number.isFinite(m.latestMoversZScore)
            ? `Z ${m.latestMoversZScore.toFixed(1)}σ`
            : null,
      }));

    const industryPeers: RelatedStock[] = dedupeShareClasses(industryRaw, 3).map((p) => ({
      symbol: p.symbol,
      name: p.name,
      changePct: p.lastChangePct ?? null,
      badge: null,
    }));

    // Fundamental groups need our own scores as the reference point.
    let cheaper: RelatedStock[] = [];
    let similar: RelatedStock[] = [];
    if (self?.overallScore != null || self?.valuationScore != null) {
      const [cheaperRaw, similarRaw] = await Promise.all([
        self.valuationScore != null
          ? prisma.analysisCache.findMany({
              where: {
                symbol: { not: symbol },
                valuationScore: { gte: Math.min(100, self.valuationScore + 10) },
                ticker: { sector },
              },
              orderBy: { valuationScore: 'desc' },
              take: 4,
              select: { symbol: true, valuationScore: true, ticker: { select: { name: true, lastChangePct: true } } },
            })
          : Promise.resolve([]),
        self.overallScore != null
          ? prisma.analysisCache.findMany({
              where: {
                symbol: { not: symbol },
                overallScore: { gte: self.overallScore - 10, lte: self.overallScore + 10 },
                ticker: { sector },
              },
              take: 10,
              select: { symbol: true, overallScore: true, ticker: { select: { name: true, lastChangePct: true } } },
            })
          : Promise.resolve([]),
      ]);

      cheaper = cheaperRaw.map((c) => ({
        symbol: c.symbol,
        name: c.ticker.name,
        changePct: c.ticker.lastChangePct,
        badge: c.valuationScore != null ? `Valuation ${Math.round(c.valuationScore)}` : null,
      }));

      const cur = self.overallScore ?? 0;
      similar = similarRaw
        .sort((a, b) => Math.abs((a.overallScore ?? 0) - cur) - Math.abs((b.overallScore ?? 0) - cur))
        .map((s) => ({
          symbol: s.symbol,
          name: s.ticker.name,
          changePct: s.ticker.lastChangePct,
          badge: s.overallScore != null ? `Score ${Math.round(s.overallScore)}` : null,
        }));
    }

    return assembleRelatedGroups({ sector, industry, movers, industryPeers, cheaper, similar });
  } catch {
    return empty;
  }
}
