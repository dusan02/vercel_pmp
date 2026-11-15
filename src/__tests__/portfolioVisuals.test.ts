import { formatCurrencyCompact } from '@/lib/utils/format';
import {
  formatDonutTotal,
  layoutDonutLabels,
  shortenIndustryLabel,
} from '@/lib/utils/portfolioDonutLayout';
import { getDesktopTreemapPadding, sectorLabelHeight } from '@/lib/heatmap/treemapPadding';

describe('Portfolio visualization helpers', () => {
  test('formatCurrencyCompact formats negative values with a single leading minus sign', () => {
    expect(formatCurrencyCompact(-744, true)).toBe('-$744');
    expect(formatCurrencyCompact(-315.4, true)).toBe('-$315');
    expect(formatCurrencyCompact(-1_250_000, true)).toBe('-$1.25M');
    expect(formatCurrencyCompact(-2_500_000_000, false)).toBe('-$2.50B');
    expect(formatCurrencyCompact(3348, true)).toBe('+$3,348');
    expect(formatCurrencyCompact(0, true)).toBe('$0');
  });

  test('shortenIndustryLabel keeps similar semiconductor industries distinct and concise', () => {
    expect(shortenIndustryLabel('Semiconductor Equipment & Materials')).toBe('Semi Equipment');
    expect(shortenIndustryLabel('Semiconductors')).toBe('Semiconductors');
    expect(shortenIndustryLabel('Internet Content & Information')).toBe('Internet Content');
    expect(shortenIndustryLabel('Software—Application')).toBe('Software (App)');
    expect(shortenIndustryLabel('Footwear & Accessories')).toBe('Footwear & Acc.');
  });

  test('formatDonutTotal produces deterministic dot-decimal totals', () => {
    expect(formatDonutTotal(221_410)).toBe('$221.4k');
    expect(formatDonutTotal(1_540_000)).toBe('$1.5M');
    expect(formatDonutTotal(420)).toBe('$420');
  });

  test('layoutDonutLabels separates tightly clustered upper-quadrant slices without overlap', () => {
    const outerRadius = 120;
    const halfHeight = 178;
    const deg = (d: number) => (d * Math.PI) / 180;

    const result = layoutDonutLabels(
      [
        { key: 'NU', label: 'NU', percentage: 15.9, midAngleRad: deg(28) },
        { key: 'MSFT', label: 'MSFT', percentage: 6.1, midAngleRad: deg(297) },
        { key: 'SPGI', label: 'SPGI', percentage: 5.3, midAngleRad: deg(317) },
        { key: 'AVGO', label: 'AVGO', percentage: 4.8, midAngleRad: deg(335) },
        { key: 'NVDA', label: 'NVDA', percentage: 4.4, midAngleRad: deg(352) },
      ],
      outerRadius,
      halfHeight,
    );

    const left = result.filter((l) => !l.isRight).sort((a, b) => a.labelY - b.labelY);
    expect(left).toHaveLength(4);
    for (let i = 1; i < left.length; i++) {
      expect(left[i]!.labelY - left[i - 1]!.labelY).toBeGreaterThanOrEqual(27.9);
    }
    for (const lbl of result) {
      expect(lbl.labelY).toBeGreaterThanOrEqual(-halfHeight + 16);
      expect(lbl.labelY).toBeLessThanOrEqual(halfHeight - 22);
    }
  });

  test('getDesktopTreemapPadding omits header/border chrome for variant="none"', () => {
    expect(sectorLabelHeight('none')).toBe(0);
    expect(sectorLabelHeight('compact')).toBeGreaterThan(0);

    const nonePad = getDesktopTreemapPadding('none');
    expect(nonePad.padding('sector')).toBe(0);
    expect(nonePad.padding('industry')).toBe(0);
    expect(nonePad.paddingTop('sector')).toBe(0);
    expect(nonePad.paddingTop('industry')).toBe(0);
    expect(nonePad.paddingBottom('sector')).toBe(0);

    const compactPad = getDesktopTreemapPadding('compact');
    expect(compactPad.paddingTop('sector')).toBeGreaterThan(0);
    expect(compactPad.paddingTop('industry')).toBe(14);
  });
});
