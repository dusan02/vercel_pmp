import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Test critical API endpoints
describe('API Health Tests', () => {
  it('should validate sector overrides', async () => {
    // Test that our overrides are properly defined
    const { SECTOR_INDUSTRY_OVERRIDES } = await import('@/data/sectorIndustryOverrides');
    
    expect(SECTOR_INDUSTRY_OVERRIDES.GOOGL).toBeDefined();
    expect(SECTOR_INDUSTRY_OVERRIDES.GOOGL?.sector).toBe('Technology');
    expect(SECTOR_INDUSTRY_OVERRIDES.META).toBeDefined();
    expect(SECTOR_INDUSTRY_OVERRIDES.META?.sector).toBe('Technology');
  });

  it('should validate MAJOR_SECTORS update', async () => {
    // Test that our heatmap layout uses correct sector names
    const fs = await import('fs');
    const path = await import('path');
    
    const heatmapLayoutPath = path.join(process.cwd(), 'src/lib/utils/heatmapLayout.ts');
    const heatmapLayoutContent = fs.readFileSync(heatmapLayoutPath, 'utf8');
    
    // Check that MAJOR_SECTORS includes our updated sector names
    expect(heatmapLayoutContent).toContain("'Financial Services'");
    expect(heatmapLayoutContent).toContain("'Consumer Cyclical'");
    expect(heatmapLayoutContent).toContain("'Technology'");
    expect(heatmapLayoutContent).toContain("MAJOR_SECTORS");
  });

  it('should validate dev cache clear component', async () => {
    // Test that our new DevCacheClear component exists
    const fs = await import('fs');
    const path = await import('path');
    
    const devCacheClearPath = path.join(process.cwd(), 'src/components/DevCacheClear.tsx');
    const exists = fs.existsSync(devCacheClearPath);
    
    expect(exists).toBe(true);
    
    if (exists) {
      const content = fs.readFileSync(devCacheClearPath, 'utf8');
      expect(content).toContain('use client');
      expect(content).toContain('DevCacheClear');
    }
  });
});

// Test component exports & route registries
describe('Component Export & Registry Tests', () => {
  it('should have required files', async () => {
    const fs = await import('fs');
    const path = await import('path');
    
    const requiredFiles = [
      'src/components/DevCacheClear.tsx',
      'src/lib/utils/heatmapLayout.ts',
      'src/data/sectorIndustryOverrides.ts',
      'ecosystem.config.cjs'
    ];
    
    for (const file of requiredFiles) {
      const filePath = path.join(process.cwd(), file);
      const exists = fs.existsSync(filePath);
      expect(exists).toBe(true);
    }
  });

  it('should keep METRIC_PAGES slugs and metrics aligned with HEATMAP_METRICS', async () => {
    const { METRIC_PAGES } = await import('@/lib/heatmap/metricPages');
    const { HEATMAP_METRICS, isHeatmapMetric } = await import('@/lib/heatmap/metricValue');

    const metricIds = HEATMAP_METRICS.map((m) => m.id);
    expect(new Set(metricIds).size).toBe(metricIds.length);

    const slugs = new Set<string>();
    for (const page of METRIC_PAGES) {
      expect(slugs.has(page.slug)).toBe(false);
      slugs.add(page.slug);
      expect(isHeatmapMetric(page.metric)).toBe(true);
      expect(page.h1.length).toBeGreaterThan(3);
      expect(page.faq.length).toBeGreaterThanOrEqual(2);
    }
  });
});
