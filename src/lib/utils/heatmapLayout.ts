/**
 * Heatmap Layout Utilities
 * D3 treemap layout calculations and hierarchy building
 */

import type { CompanyNode, HeatmapMetric, HierarchyData } from '@/components/MarketHeatmap';

/**
 * Transformuje plochý zoznam firiem na hierarchickú štruktúru pre D3
 */
export function buildHeatmapHierarchy(
  data: CompanyNode[],
  metric: HeatmapMetric = 'percent'
): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  const industryMap = new Map<string, HierarchyData>();

  let skippedCount = 0;

  for (const company of data) {
    // Podľa metriky vyberieme hodnotu pre veľkosť dlaždice
    let tileValue: number;
    if (metric === 'mcap') {
      tileValue = company.marketCapDiffAbs || Math.abs(company.marketCapDiff || 0);
    } else {
      tileValue = company.marketCap || 0;
    }

    // Skontrolujme, či má firma platnú hodnotu (D3 ignoruje hodnoty <= 0)
    if (tileValue <= 0) {
      skippedCount++;
      continue;
    }

    // 1. Nájdi alebo vytvor Sektor
    let sectorNode = sectorMap.get(company.sector);
    if (!sectorNode) {
      sectorNode = { name: company.sector, children: [], meta: { type: 'sector' } };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    // 2. Nájdi alebo vytvor Industry
    const industryKey = `${company.sector}-${company.industry}`;
    let industryNode = industryMap.get(industryKey);
    if (!industryNode) {
      industryNode = {
        name: company.industry,
        children: [],
        meta: { type: 'industry' },
      };
      industryMap.set(industryKey, industryNode);
      sectorNode.children!.push(industryNode);
    }

    // 3. Pridaj list (Firmu)
    const companyLeaf: HierarchyData = {
      name: company.symbol,
      value: tileValue,
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    industryNode.children!.push(companyLeaf);
  }

  if (skippedCount > 0 && process.env.NODE_ENV !== 'production') {
    const metricName = metric === 'mcap' ? 'marketCapDiffAbs' : 'marketCap';
    console.warn(`⚠️ buildHierarchy: Preskočených ${skippedCount} firiem bez ${metricName} z ${data.length} celkom`);
  }

  return root;
}

