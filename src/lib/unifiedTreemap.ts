/**
 * Unified Treemap Layout Algorithm with Industry Sub-sections
 * Creates one unified treemap where:
 * - Sectors are arranged left to right by market cap (largest left)
 * - Industries within sectors are arranged as sub-sections
 * - Stocks within industries are arranged by market cap (largest left/top)
 * - Supports sublinear scaling (log/power scale) to prevent large sectors from dominating
 * - Supports clamping sector widths for better readability
 */

export interface TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  sector?: string;
  industry?: string;
  isOther?: boolean; // True for "OTHER" mini-grid items
  otherCount?: number; // Number of items in OTHER group
}

type Rect = { x: number; y: number; w: number; h: number };

type HeatItem = { 
  marketCap: number;
  data: any;
};

export interface IndustryGroup {
  industry: string;
  totalMarketCap: number;
  stocks: any[];
}

export interface SectorLayout {
  sector: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  industries: IndustryLayout[];
  stocks: TreemapNode[];
}

export interface IndustryLayout {
  industry: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalMarketCap: number;
  stocks: TreemapNode[];
}

export type LayoutOpts = {
  alpha?: number;               // 0.6–0.85 typicky (1 = linear, <1 = sublinear)
  minSectorWidthPx?: number;    // napr. 140
  maxSectorFrac?: number;       // napr. 0.35 (35% šírky)
  minCellSize?: number;         // Minimum cell size for mini-grid (default 12px)
  targetAspect?: number;        // Target aspect ratio for squarify (default 1.7)
  industryLabelHeight?: number; // Height for industry labels (default 20px)
};

/**
 * Calculate unified treemap layout with industry sub-sections
 * Sectors: left to right (largest to smallest)
 * Industries within sectors: arranged as sub-sections
 * Stocks in each industry: arranged by market cap (largest left/top)
 * 
 * @param sectors Array of sector groups
 * @param containerWidth Container width in pixels
 * @param containerHeight Container height in pixels
 * @param opts Layout options (alpha, minSectorWidthPx, maxSectorFrac)
 */
export function calculateUnifiedTreemap(
  sectors: Array<{ sector: string; stocks: any[]; totalMarketCap: number }>,
  containerWidth: number,
  containerHeight: number,
  opts: LayoutOpts = {}
): {
  sectors: SectorLayout[];
  allNodes: TreemapNode[];
} {
  if (sectors.length === 0) {
    return { sectors: [], allNodes: [] };
  }

  const alpha = opts.alpha ?? 1.0;
  const minW = opts.minSectorWidthPx ?? 140;
  const maxFrac = opts.maxSectorFrac ?? 0.6;
  const minCellSize = opts.minCellSize ?? 12;
  const targetAspect = opts.targetAspect ?? 1.7;
  const industryLabelHeight = opts.industryLabelHeight ?? 20;
  const sectorLabelHeight = 24;

  // Sort sectors by total market cap (largest first = leftmost)
  const sortedSectors = [...sectors].sort((a, b) => b.totalMarketCap - a.totalMarketCap);
  
  // Calculate total market cap
  const totalMarketCap = sortedSectors.reduce((sum, s) => sum + s.totalMarketCap, 0);
  
  if (totalMarketCap === 0) {
    return { sectors: [], allNodes: [] };
  }

  // 1) Sublineárne váhy (power scale)
  const weights = sortedSectors.map(s => Math.max(0, Math.pow(s.totalMarketCap, alpha)));
  const totalW = weights.reduce((a, b) => a + b, 0);

  // 2) Predbežné šírky
  let widths = weights.map(w => (w / totalW) * containerWidth);

  // 3) Clamp + renormalizácia
  const maxW = containerWidth * maxFrac;
  widths = widths.map(w => Math.min(Math.max(w, minW), maxW));

  const sumClamped = widths.reduce((a, b) => a + b, 0);
  
  // Ak sme prešvihli, renormalizuj proporcionálne (okrem tých, čo už sedia na min/max)
  if (sumClamped !== containerWidth) {
    const flexIdx = widths
      .map((w, i) => ({ i, w, locked: w === minW || w === maxW }))
      .filter(x => !x.locked)
      .map(x => x.i);

    const flexSum = flexIdx.reduce((a, i) => a + widths[i], 0);
    const targetFlex = containerWidth - widths.reduce((a, w, i) => a + (flexIdx.includes(i) ? 0 : w), 0);
    const k = flexSum > 0 ? (targetFlex / flexSum) : 1;

    flexIdx.forEach(i => { 
      widths[i] = Math.max(minW, Math.min(maxW, widths[i] * k)); 
    });
  }

  const sectorLayouts: SectorLayout[] = [];
  const allNodes: TreemapNode[] = [];
  
  // 4) Layout sektorov with industry sub-sections
  let currentX = 0;
  
  sortedSectors.forEach((sector, i) => {
    const sectorWidth = widths[i];
    const sectorHeight = containerHeight - sectorLabelHeight;
    const sectorArea = sectorWidth * sectorHeight;
    
    // Group stocks by industry within sector
    const industryMap = new Map<string, any[]>();
    
    for (const stock of sector.stocks) {
      const industry = stock.industry || 'Uncategorized';
      if (!industryMap.has(industry)) {
        industryMap.set(industry, []);
      }
      industryMap.get(industry)!.push(stock);
    }
    
    // Create industry groups
    const industryGroups: IndustryGroup[] = Array.from(industryMap.entries()).map(([industry, stocks]) => {
      // Sort stocks by market cap (largest first)
      const sortedStocks = stocks.sort((a, b) => b.marketCap - a.marketCap);
      const totalMarketCap = sortedStocks.reduce((sum, stock) => sum + stock.marketCap, 0);
      
      return {
        industry,
        totalMarketCap,
        stocks: sortedStocks
      };
    });
    
    // Sort industries by total market cap (largest first)
    industryGroups.sort((a, b) => b.totalMarketCap - a.totalMarketCap);
    
    // Calculate area scale: px^2 per marketCap unit
    const sectorTotalMarketCap = sector.totalMarketCap;
    const areaScale = sectorTotalMarketCap > 0 ? sectorArea / sectorTotalMarketCap : 0;
    
    // Layout industries within sector
    const industryLayouts: IndustryLayout[] = [];
    const sectorNodes: TreemapNode[] = [];
    let currentY = sectorLabelHeight;
    
    for (const industryGroup of industryGroups) {
      const industryArea = (industryGroup.totalMarketCap / sectorTotalMarketCap) * sectorArea;
      const industryHeight = Math.max(industryLabelHeight + minCellSize * 2, industryArea / sectorWidth);
      
      // Check if industry fits in remaining space
      if (currentY + industryHeight > containerHeight) {
        // If doesn't fit, create a compact layout or skip
        break;
      }
      
      // Create industry rect
      const industryRect: Rect = {
        x: currentX,
        y: currentY,
        w: sectorWidth,
        h: industryHeight
      };
      
      // Layout stocks within industry
      const stockArea = industryArea - (industryLabelHeight * sectorWidth);
      const stockAreaScale = industryGroup.totalMarketCap > 0 
        ? stockArea / industryGroup.totalMarketCap 
        : 0;
      
      // Convert stocks to HeatItems
      const heatItems: HeatItem[] = industryGroup.stocks.map(stock => ({
        marketCap: stock.marketCap,
        data: stock
      }));
      
      // Use squarify for stocks within industry
      const stockRect: Rect = {
        x: currentX,
        y: currentY + industryLabelHeight,
        w: sectorWidth,
        h: industryHeight - industryLabelHeight
      };
      
      const packedRects = squarifyStocks(heatItems, stockRect, stockAreaScale, targetAspect, { preferRows: false });
      
      // Create nodes for stocks
      const industryNodes: TreemapNode[] = [];
      
      packedRects.forEach((rect, idx) => {
        if (idx < heatItems.length) {
          industryNodes.push({
            x: rect.x,
            y: rect.y,
            width: rect.w,
            height: rect.h,
            data: heatItems[idx].data,
            sector: sector.sector,
            industry: industryGroup.industry
          });
        }
      });
      
      // Add industry label node (invisible, just for reference)
      industryLayouts.push({
        industry: industryGroup.industry,
        x: currentX,
        y: currentY,
        width: sectorWidth,
        height: industryHeight,
        totalMarketCap: industryGroup.totalMarketCap,
        stocks: industryNodes
      });
      
      // Add all nodes to sector nodes
      industryNodes.forEach(node => sectorNodes.push(node));
      
      currentY += industryHeight;
    }
    
    // Add all sector nodes to allNodes
    sectorNodes.forEach(node => allNodes.push(node));
    
    sectorLayouts.push({
      sector: sector.sector,
      x: currentX,
      y: 0,
      width: sectorWidth,
      height: containerHeight,
      totalMarketCap: sector.totalMarketCap,
      industries: industryLayouts,
      stocks: sectorNodes
    });
    
    currentX += sectorWidth;
  });
  
  return {
    sectors: sectorLayouts,
    allNodes
  };
}

type SquarifyOpts = { preferRows?: boolean };

/**
 * Squarified treemap algorithm for better aspect ratios
 * Based on Bruls et al. 2000 - minimizes worst aspect ratio
 */
function squarifyStocks(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  targetAspect: number = 1.7,
  opts: SquarifyOpts = {}
): Rect[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  
  const result: Rect[] = [];
  const sizes = items.map(it => Math.max(0, it.marketCap) * areaScale);
  const totalArea = sizes.reduce((a, b) => a + b, 0);
  if (totalArea === 0) return [];
  
  let x = rect.x, y = rect.y, w = rect.w, h = rect.h;

  // Helper: calculate worst aspect ratio for a row
  const worstAspect = (areas: number[], shortSide: number, isHorizontal: boolean): number => {
    if (areas.length === 0 || shortSide <= 0) return Infinity;
    const sum = areas.reduce((a, b) => a + b, 0);
    if (sum === 0) return Infinity;
    
    const longSide = sum / shortSide;
    let worst = 0;
    
    for (const a of areas) {
      if (a <= 0) continue;
      const itemWidth = isHorizontal ? (a / sum) * longSide : shortSide;
      const itemHeight = isHorizontal ? shortSide : (a / sum) * longSide;
      const aspect = Math.max(itemWidth / itemHeight, itemHeight / itemWidth);
      worst = Math.max(worst, aspect);
    }
    
    return worst;
  };

  // Determine initial orientation
  const isHorizontal = opts.preferRows !== undefined 
    ? opts.preferRows 
    : w >= h;

  let remaining = [...sizes];
  let currentRow: number[] = [];

  while (remaining.length > 0) {
    const nextItem = remaining[0];
    
    // Try adding to current row
    const testRow = [...currentRow, nextItem];
    const testWorst = worstAspect(testRow, isHorizontal ? h : w, isHorizontal);
    
    // Compare with starting a new row
    const newRowWorst = worstAspect([nextItem], isHorizontal ? h : w, isHorizontal);
    
    if (currentRow.length === 0 || testWorst <= newRowWorst * 1.1) {
      // Add to current row
      currentRow.push(nextItem);
      remaining.shift();
    } else {
      // Finalize current row and start new one
      if (currentRow.length > 0) {
        const rowSum = currentRow.reduce((a, b) => a + b, 0);
        
        if (isHorizontal) {
          const rowHeight = rowSum / w;
          let itemX = x;
          
          for (const area of currentRow) {
            const itemWidth = (area / rowSum) * w;
            result.push({ x: itemX, y: y, w: itemWidth, h: rowHeight });
            itemX += itemWidth;
          }
          
          y += rowHeight;
          h -= rowHeight;
        } else {
          const rowWidth = rowSum / h;
          let itemY = y;
          
          for (const area of currentRow) {
            const itemHeight = (area / rowSum) * h;
            result.push({ x: x, y: itemY, w: rowWidth, h: itemHeight });
            itemY += itemHeight;
          }
          
          x += rowWidth;
          w -= rowWidth;
        }
        
        currentRow = [];
      }
      
      // Switch orientation if needed
      if (w <= 0 || h <= 0) break;
      const shouldSwitch = (isHorizontal && w < h) || (!isHorizontal && h < w);
      if (shouldSwitch) {
        // Switch orientation
        const temp = w;
        w = h;
        h = temp;
        // Note: x, y positions need adjustment based on new orientation
      }
    }
  }
  
  // Finalize last row
  if (currentRow.length > 0 && w > 0 && h > 0) {
    const rowSum = currentRow.reduce((a, b) => a + b, 0);
    
    if (isHorizontal) {
      const rowHeight = rowSum / w;
      let itemX = x;
      
      for (const area of currentRow) {
        const itemWidth = (area / rowSum) * w;
        result.push({ x: itemX, y: y, w: itemWidth, h: rowHeight });
        itemX += itemWidth;
      }
    } else {
      const rowWidth = rowSum / h;
      let itemY = y;
      
      for (const area of currentRow) {
        const itemHeight = (area / rowSum) * h;
        result.push({ x: x, y: itemY, w: rowWidth, h: itemHeight });
        itemY += itemHeight;
      }
    }
  }
  
  return result;
}

/**
 * Create mini-grid for micro items
 */
function createMiniGrid(items: HeatItem[], rect: Rect, minCellSize: number): Rect[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  
  const cols = Math.max(1, Math.floor(rect.w / minCellSize));
  const rows = Math.ceil(items.length / cols);
  const cellWidth = rect.w / cols;
  const cellHeight = Math.min(rect.h / rows, minCellSize * 2);
  
  const grid: Rect[] = [];
  
  for (let i = 0; i < items.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    
    grid.push({
      x: rect.x + col * cellWidth,
      y: rect.y + row * cellHeight,
      w: cellWidth,
      h: cellHeight
    });
  }
  
  return grid;
}
