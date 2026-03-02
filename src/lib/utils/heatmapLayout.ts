/**
 * Heatmap Layout Utilities
 * D3 treemap layout calculations and hierarchy building
 */

import type { CompanyNode, HeatmapMetric, HierarchyData } from '@/lib/heatmap/types';

/**
 * Transformuje plochý zoznam firiem na hierarchickú štruktúru pre D3
 */
export function buildHeatmapHierarchy(
  data: CompanyNode[],
  metric: HeatmapMetric = 'percent'
): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  // Track seen tickers to prevent duplicates (keep first occurrence)
  const seenTickers = new Set<string>();

  let skippedCount = 0;
  let duplicateCount = 0;

  for (const company of data) {
    // Skip duplicate tickers (keep first occurrence)
    const symbol = company.symbol?.toUpperCase();
    if (!symbol || seenTickers.has(symbol)) {
      duplicateCount++;
      continue;
    }
    seenTickers.add(symbol);

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
      // Vytvor sektor s agregačnými hodnotami
      sectorNode = {
        name: company.sector,
        children: [],
        meta: {
          type: 'sector',
          totalMarketCap: 0,
          weightedPercentSum: 0,
          companyCount: 0
        }
      };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    // 2. Nájdi alebo vytvor Industry (iba pre veľké sektory)
    const LARGE_SECTORS = ['Technology', 'Financial Services', 'Consumer Cyclical', 'Healthcare'];
    const isLargeSector = LARGE_SECTORS.includes(company.sector);

    let parentNodeForCompany = sectorNode;

    if (isLargeSector && company.industry) {
      // Potrebujeme medzivrstvu pre Industry
      let industryNode = sectorNode.children!.find(c => c.meta?.type === 'industry' && c.name === company.industry);

      if (!industryNode) {
        industryNode = {
          name: company.industry,
          children: [],
          meta: {
            type: 'industry',
            totalMarketCap: 0,
            weightedPercentSum: 0,
            companyCount: 0
          }
        };
        sectorNode.children!.push(industryNode);
      }

      // Aktualizuj agregácie pre Industry
      if (industryNode.meta && company.marketCap && company.changePercent !== undefined && !isNaN(company.changePercent)) {
        industryNode.meta.totalMarketCap! += company.marketCap;
        industryNode.meta.weightedPercentSum! += company.changePercent * company.marketCap;
        industryNode.meta.companyCount!++;
      }

      parentNodeForCompany = industryNode;
    }

    // 3. Pridaj list (Firmu) pod správneho rodiča (Sektor alebo Industry)
    const companyLeaf: HierarchyData = {
      name: company.symbol,
      value: tileValue,
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    parentNodeForCompany.children!.push(companyLeaf);

    // Aktualizuj agregácie pre sektor (vážený priemer)
    if (sectorNode.meta && company.marketCap && company.changePercent !== undefined && !isNaN(company.changePercent)) {
      sectorNode.meta.totalMarketCap! += company.marketCap;
      sectorNode.meta.weightedPercentSum! += company.changePercent * company.marketCap;
      sectorNode.meta.companyCount!++;
    }
  }

  // Deterministické zoradenie:
  // - firmy v sektore podľa veľkosti (value) desc
  // - sektory podľa sumy value desc, ale "Other" sektor je vždy posledný
  const sumValues = (node: HierarchyData): number => {
    if (typeof node.value === 'number') return node.value;
    if (!node.children) return 0;
    return node.children.reduce((acc, c) => acc + sumValues(c), 0);
  };

  if (root.children) {
    // Zoraď firmy v každom sektore podľa veľkosti (value) desc
    for (const sector of root.children) {
      if (sector.children) {
        // Industry sub-nodes sorting logic inside sector
        for (const child of sector.children) {
          if (child.meta?.type === 'industry' && child.children) {
            // Sort companies within industry
            child.children.sort((a, b) => (sumValues(b) - sumValues(a)));

            // Calc industry aggregates
            if (child.meta.totalMarketCap && child.meta.totalMarketCap > 0) {
              child.meta.weightedAvgPercent = child.meta.weightedPercentSum! / child.meta.totalMarketCap;
            }
          }
        }

        // Sort the sector's immediate children (which could be either industries or companies)
        sector.children.sort((a, b) => (sumValues(b) - sumValues(a)));
      }

      // Vypočítaj vážený priemer pre každý sektor
      if (sector.meta && sector.meta.totalMarketCap && sector.meta.totalMarketCap > 0) {
        sector.meta.weightedAvgPercent = sector.meta.weightedPercentSum! / sector.meta.totalMarketCap;

        if (process.env.NODE_ENV !== 'production') {
          console.log(`📊 Sektor ${sector.name}: ${sector.meta.companyCount} firiem, vážený priemer: ${sector.meta.weightedAvgPercent.toFixed(2)}%`);
        }
      }
    }

    // Zoraď sektory podľa sumy value desc, ale "Technology" je vždy prvá a "Other" je vždy posledný
    root.children.sort((a, b) => {
      const aIsTechnology = a.name === 'Technology';
      const bIsTechnology = b.name === 'Technology';
      const aIsOther = a.name === 'Other';
      const bIsOther = b.name === 'Other';

      // Technology is always first
      if (aIsTechnology && !bIsTechnology) return -1;
      if (!aIsTechnology && bIsTechnology) return 1;

      // "Other" sektor je vždy posledný
      if (aIsOther && !bIsOther) return 1;
      if (!aIsOther && bIsOther) return -1;
      if (aIsOther && bIsOther) return 0; // Oba sú Other - zachovať poradie

      // Ostatné sektory podľa sumy value desc
      return sumValues(b) - sumValues(a);
    });

    // Logovanie zoradenia sektorov (len v development)
    if (process.env.NODE_ENV !== 'production' && root.children.length > 0) {
      const sectorOrder = root.children.map(s => ({
        name: s.name,
        totalValue: sumValues(s),
        companyCount: s.children?.length || 0,
        weightedAvgPercent: s.meta?.weightedAvgPercent?.toFixed(2) || 'N/A'
      }));
      console.log('📊 Heatmap sector order (by total market cap):', sectorOrder);
    }
  }

  if (skippedCount > 0 && process.env.NODE_ENV !== 'production') {
    const metricName = metric === 'mcap' ? 'marketCapDiffAbs' : 'marketCap';
    console.warn(`⚠️ buildHierarchy: Preskočených ${skippedCount} firiem bez ${metricName} z ${data.length} celkom`);
  }

  if (duplicateCount > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(`⚠️ buildHierarchy: Nájdených ${duplicateCount} duplicitných tickerov (odstránených)`);
  }

  return root;
}

