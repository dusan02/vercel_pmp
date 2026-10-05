import { assembleRelatedGroups, type RelatedStock } from '@/lib/analysis/relatedOpportunities';

const s = (symbol: string, badge: string | null = null): RelatedStock => ({
  symbol,
  name: `${symbol} Inc`,
  changePct: 1.5,
  badge,
});

const base = {
  sector: 'Technology',
  industry: 'Semiconductors',
  movers: [] as RelatedStock[],
  industryPeers: [] as RelatedStock[],
  cheaper: [] as RelatedStock[],
  similar: [] as RelatedStock[],
};

describe('assembleRelatedGroups', () => {
  it('returns no groups when there are no candidates', () => {
    const r = assembleRelatedGroups(base);
    expect(r.groups).toHaveLength(0);
  });

  it('orders groups movers → industry → cheaper → similar', () => {
    const r = assembleRelatedGroups({
      ...base,
      movers: [s('AMD', 'Z 4.2σ')],
      industryPeers: [s('TSM')],
      cheaper: [s('MU', 'Valuation 80')],
      similar: [s('QCOM', 'Score 78')],
    });
    expect(r.groups.map((g) => g.key)).toEqual(['movers', 'industry', 'cheaper', 'similar']);
  });

  it('dedupes symbols — first-seen group keeps the item', () => {
    const r = assembleRelatedGroups({
      ...base,
      movers: [s('AMD', 'Z 4.2σ'), s('AVGO', 'Z 2.1σ')],
      industryPeers: [s('AMD'), s('TSM')],
      cheaper: [s('AMD'), s('MU')],
      similar: [s('AMD'), s('QCOM')],
    });
    const all = r.groups.flatMap((g) => g.items.map((i) => i.symbol));
    expect(all).toEqual(['AMD', 'AVGO', 'TSM', 'MU', 'QCOM']);
    expect(new Set(all).size).toBe(all.length);
  });

  it('caps movers at 2 and total at 6', () => {
    const r = assembleRelatedGroups({
      ...base,
      movers: [s('A'), s('B'), s('C'), s('D')],
      industryPeers: [s('E'), s('F'), s('G')],
      cheaper: [s('H'), s('I')],
      similar: [s('J'), s('K')],
    });
    expect(r.groups.find((g) => g.key === 'movers')!.items).toHaveLength(2);
    expect(r.groups.find((g) => g.key === 'industry')!.items).toHaveLength(2);
    expect(r.groups.find((g) => g.key === 'cheaper')!.items).toHaveLength(1);
    expect(r.groups.find((g) => g.key === 'similar')!.items).toHaveLength(1);
    expect(r.groups.flatMap((g) => g.items)).toHaveLength(6);
  });

  it('omits empty groups entirely', () => {
    const r = assembleRelatedGroups({ ...base, movers: [s('AMD')], similar: [s('QCOM')] });
    expect(r.groups.map((g) => g.key)).toEqual(['movers', 'similar']);
  });

  it('labels industry group with the industry name', () => {
    const r = assembleRelatedGroups({ ...base, industryPeers: [s('TSM')] });
    expect(r.groups[0]!.label).toBe('More Semiconductors stocks');
  });

  it('ETF-style ticker with no industry still gets movers group', () => {
    const r = assembleRelatedGroups({ ...base, industry: null, movers: [s('QQQ')] });
    expect(r.groups.map((g) => g.key)).toEqual(['movers']);
  });
});
