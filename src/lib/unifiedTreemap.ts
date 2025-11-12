/**
 * Unified Treemap Layout Algorithm
 * Creates one unified treemap where:
 * - Sectors are arranged left to right by market cap (largest left)
 * - Stocks within sectors are arranged top to bottom by market cap (largest top)
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
  isOther?: boolean; // True for "OTHER" mini-grid items
  otherCount?: number; // Number of items in OTHER group
}

type Rect = { x: number; y: number; w: number; h: number };

type HeatItem = { 
  marketCap: number;
  data: any;
};

export interface SectorLayout {
  sector: string;
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
};

/**
 * Calculate unified treemap layout
 * Sectors: left to right (largest to smallest)
 * Stocks in each sector: top to bottom (largest to smallest)
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

  const alpha = opts.alpha ?? 0.72;
  const minW = opts.minSectorWidthPx ?? 140;
  const maxFrac = opts.maxSectorFrac ?? 0.35;
  const minCellSize = opts.minCellSize ?? 12;
  const targetAspect = opts.targetAspect ?? 1.7;

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
  
  // 4) Layout sektorov with squarified treemap
  let currentX = 0;
  
  sortedSectors.forEach((sector, i) => {
    const sectorWidth = widths[i];
    const sectorHeight = containerHeight - 24; // Minus label height
    const sectorArea = sectorWidth * sectorHeight;
    
    // Sort stocks within sector by market cap (largest first - order preserving)
    const sortedStocks = [...sector.stocks].sort((a, b) => b.marketCap - a.marketCap);
    
    // Calculate area scale: px^2 per marketCap unit
    const sectorTotalMarketCap = sector.totalMarketCap;
    const areaScale = sectorTotalMarketCap > 0 ? sectorArea / sectorTotalMarketCap : 0;
    
    // Inner rect for stocks (excluding label)
    const innerRect: Rect = {
      x: currentX,
      y: 24,
      w: sectorWidth,
      h: sectorHeight
    };
    
    // Convert stocks to HeatItems
    const heatItems: HeatItem[] = sortedStocks.map(stock => ({
      marketCap: stock.marketCap,
      data: stock
    }));
    
    // orientačný hint – ak je sektor výrazne "na výšku", začni horizontálnym riadkom
    const sectorAspect = sectorHeight / Math.max(1, sectorWidth);
    const preferRows = sectorAspect > 1.25;
    
    // Use direct squarify - allows multiple firms per row, better fills space
    const packedRects = squarifyStocks(heatItems, innerRect, areaScale, targetAspect, { preferRows });
    
    // Filter micro items and create mini-grid
    // Mikro-cutoff podľa podielu (nie pixlov) - aby to fungovalo rovnako na 900px aj 1800px výškach
    const pctCutoff = 0.002; // 0.2% sektorovej plochy
    const areaCutoff = sectorArea * pctCutoff;
    
    const finalNodes: TreemapNode[] = [];
    const micros: HeatItem[] = [];
    
    packedRects.forEach((rect, idx) => {
      const rectArea = rect.w * rect.h;
      // Použi percentuálny cutoff namiesto pixelového
      if (rectArea < areaCutoff) {
        micros.push(heatItems[idx]);
      } else {
        finalNodes.push({
          x: rect.x,
          y: rect.y,
          width: rect.w,
          height: rect.h,
          data: heatItems[idx].data,
          sector: sector.sector
        });
      }
    });
    
    // Calculate otherCap early for renormalization
    const otherCap = micros.length > 0 ? micros.reduce((sum, m) => sum + m.marketCap, 0) : 0;
    
    // Create "OTHER" mini-grid if needed
    if (micros.length > 0) {
      const otherArea = otherCap * areaScale;
      
      // Calculate remaining space after squarified layout
      // Find max Y position of final nodes
      const maxY = finalNodes.length > 0 
        ? Math.max(...finalNodes.map(n => n.y + n.height))
        : 24;
      
      const remainingHeight = (24 + sectorHeight) - maxY;
      
      // Create OTHER rect at bottom
      const otherHeight = Math.max(minCellSize * 3, Math.min(remainingHeight, sectorHeight * 0.3));
      const otherWidth = otherArea / otherHeight;
      const actualOtherWidth = Math.min(otherWidth, sectorWidth);
      const actualOtherHeight = otherArea / actualOtherWidth;
      
      // Position OTHER at bottom
      const otherRect: Rect = {
        x: currentX + sectorWidth - actualOtherWidth,
        y: maxY,
        w: actualOtherWidth,
        h: Math.min(actualOtherHeight, remainingHeight)
      };
      
      // Create mini-grid (excluding header space)
      const gridRect: Rect = {
        x: otherRect.x,
        y: otherRect.y + 20, // Header space
        w: otherRect.w,
        h: Math.max(minCellSize, otherRect.h - 20)
      };
      
      const gridRects = createMiniGrid(micros, gridRect, minCellSize);
      
      // Add OTHER header node
      finalNodes.push({
        x: otherRect.x,
        y: otherRect.y,
        width: otherRect.w,
        height: 20, // Header height
        data: {
          ticker: 'OTHER',
          name: `+${micros.length} smaller`,
          sector: sector.sector,
          industry: null,
          marketCap: otherCap,
          percentChange: 0,
          currentPrice: 0,
          sharesOutstanding: null
        },
        sector: sector.sector,
        isOther: true,
        otherCount: micros.length
      });
      
      // Add mini-grid cells
      gridRects.forEach((gridRect, gridIdx) => {
        if (gridIdx < micros.length) {
          finalNodes.push({
            x: gridRect.x,
            y: gridRect.y,
            width: gridRect.w,
            height: gridRect.h,
            data: micros[gridIdx].data,
            sector: sector.sector,
            isOther: true
          });
        }
      });
    }
    
    // Plošná renormalizácia - zabezpečí, že plocha sektora sedí so totalMarketCap
    // a vyplní celú dostupnú výšku (odstráni biele miesta)
    const mainStockNodes = finalNodes.filter(n => !n.isOther);
    if (mainStockNodes.length > 0) {
      // Vypočítaj skutočnú výšku, ktorú zaberajú nodes
      const minY = Math.min(...mainStockNodes.map(n => n.y));
      const maxY = Math.max(...mainStockNodes.map(n => n.y + n.height));
      const actualHeight = maxY - minY;
      const availableHeight = sectorHeight;
      
      // PRIORITA #1: Natiahni výšky, aby vyplnili celú výšku sektora (odstráni biele miesta)
      if (actualHeight > 0 && availableHeight > 0 && Math.abs(actualHeight - availableHeight) > 0.1) {
        const heightScaleFix = availableHeight / actualHeight;
        const baseY = minY;
        
        mainStockNodes.forEach(n => {
          // Presuň a natiahni relatívne k základnej pozícii
          const relativeY = n.y - baseY;
          n.y = 24 + relativeY * heightScaleFix;
          n.height *= heightScaleFix;
        });
      }
      
      // PRIORITA #2: Uprav šírky, aby zachoval plochu (market cap proporcie)
      const actualArea = mainStockNodes.reduce((s, n) => s + n.width * n.height, 0);
      const expectedArea = sectorArea - (otherCap * areaScale);
      
      if (actualArea > 0 && expectedArea > 0 && Math.abs(actualArea - expectedArea) > 0.1) {
        const widthScaleFix = Math.sqrt(expectedArea / actualArea); // Použij sqrt, aby sa zachoval pomer strán
        
        mainStockNodes.forEach(n => {
          const relativeX = n.x - innerRect.x;
          n.width *= widthScaleFix;
          n.x = innerRect.x + relativeX * widthScaleFix;
        });
      }
    }
    
    // Add all nodes to result
    finalNodes.forEach(node => {
      allNodes.push(node);
    });
    
    sectorLayouts.push({
      sector: sector.sector,
      x: currentX,
      y: 0,
      width: sectorWidth,
      height: containerHeight,
      totalMarketCap: sector.totalMarketCap,
      stocks: finalNodes
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

  let row: number[] = [];
  let i = 0;
  // ak preferRows=true, nech prvý strip beží horizontálne (riadky)
  let forceHorizontal = !!opts.preferRows;

  while (i < sizes.length) {
    const shortSide = Math.min(w, h);
    // pôvodne: const isHorizontal = w >= h;
    const isHorizontal = forceHorizontal ? true : (w >= h);
    
    if (shortSide <= 0 || w <= 0 || h <= 0) break;

    // Try adding next item
    const candidate = [...row, sizes[i]];
    const currentWorst = row.length > 0 ? worstAspect(row, shortSide, isHorizontal) : Infinity;
    const candidateWorst = worstAspect(candidate, shortSide, isHorizontal);

    // If adding worsens aspect ratio, finalize current row
    if (row.length > 0 && (candidateWorst > currentWorst || candidateWorst > targetAspect)) {
      // Layout current row
      const sum = row.reduce((a, b) => a + b, 0);
      if (sum <= 0) {
        row = [];
        i++;
        continue;
      }

      if (isHorizontal) {
        // Horizontal strip (row)
        const rowHeight = sum / w;
        let cx = x;
        for (const a of row) {
          const cw = (a / sum) * w;
          result.push({ 
            x: cx, 
            y: y, 
            w: cw, 
            h: rowHeight 
          });
          cx += cw;
        }
        y += rowHeight;
        h -= rowHeight;
      } else {
        // Vertical strip (column)
        const colWidth = sum / h;
        let cy = y;
        for (const a of row) {
          const ch = (a / sum) * h;
          result.push({ 
            x: x, 
            y: cy, 
            w: colWidth, 
            h: ch 
          });
          cy += ch;
        }
        x += colWidth;
        w -= colWidth;
      }

      row = [];
      // po vyrenderovaní prvého stripu: už neforceuj horizontálnu orientáciu
      forceHorizontal = false;
      continue;
    }

    row.push(sizes[i]);
    i++;
  }

  // Finalize remaining row - natiahni, aby vyplnil zvyšok výšky
  if (row.length > 0) {
    const shortSide = Math.min(w, h);
    const isHorizontal = forceHorizontal ? true : (w >= h);
    const sum = row.reduce((a, b) => a + b, 0);
    
    if (sum > 0 && shortSide > 0 && w > 0 && h > 0) {
      if (isHorizontal) {
        // Pre horizontálne: použij celú zostávajúcu výšku
        const rowHeight = h; // Použij celú zostávajúcu výšku, nie sum/w
        let cx = x;
        for (const a of row) {
          const cw = (a / sum) * w;
          result.push({ 
            x: cx, 
            y: y, 
            w: cw, 
            h: rowHeight 
          });
          cx += cw;
        }
      } else {
        // Pre vertikálne: použij celú zostávajúcu šírku
        const colWidth = w; // Použij celú zostávajúcu šírku
        let cy = y;
        for (const a of row) {
          const ch = (a / sum) * h;
          result.push({ 
            x: x, 
            y: cy, 
            w: colWidth, 
            h: ch 
          });
          cy += ch;
        }
      }
    }
  }

  return result;
}

/**
 * Banded squarify - breaks sector into horizontal bands for better readability
 * Prevents "noodle" strips in narrow sectors
 */
function bandedSquarify(
  items: HeatItem[],
  rect: Rect,
  areaScale: number,
  desiredBand: number = 120,
  minBand: number = 90,
  maxBand: number = 160,
  targetAspect: number = 1.7
): Rect[] {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  
  const totalArea = items.reduce((s, it) => s + Math.max(0, it.marketCap) * areaScale, 0);
  if (totalArea === 0) return [];
  
  // Adaptívna výška pásov podľa hustoty tickerov
  const estimatedBands = Math.ceil(items.length / 8);
  const adaptiveDesiredBand = Math.max(100, Math.min(160, rect.h / Math.max(1, estimatedBands)));
  const bands = Math.max(1, Math.round(rect.h / adaptiveDesiredBand));
  const bandH = Math.min(maxBand, Math.max(minBand, rect.h / bands));
  
  let y = rect.y;
  let i = 0;
  const out: Rect[] = [];
  
  // Vypočítaj celkovú plochu všetkých items
  const remainingArea = rect.w * rect.h;
  let remainingItems = [...items];
  
  for (let b = 0; b < bands && remainingItems.length > 0; b++) {
    const isLastBand = (b === bands - 1);
    const availableHeight = rect.y + rect.h - y;
    
    if (availableHeight <= 0) break;
    
    // Pre posledný pás použij všetky zostávajúce items
    let chunk: HeatItem[];
    if (isLastBand) {
      chunk = remainingItems;
      remainingItems = [];
    } else {
      // Pre ostatné pásy: naplň chunk podľa kapacity pásu
      const cap = rect.w * bandH;
      let sum = 0;
      chunk = [];
      
      while (remainingItems.length > 0 && sum + remainingItems[0].marketCap * areaScale <= cap * 1.15) {
        const item = remainingItems.shift()!;
        sum += item.marketCap * areaScale;
        chunk.push(item);
      }
      
      // aj keby sa nič nezmestilo, posuň sa aspoň o jednu položku
      if (chunk.length === 0 && remainingItems.length > 0) {
        chunk.push(remainingItems.shift()!);
      }
    }
    
    if (chunk.length > 0) {
      // Vypočítaj skutočnú výšku potrebnú pre chunk
      const chunkArea = chunk.reduce((s, it) => s + Math.max(0, it.marketCap) * areaScale, 0);
      const actualBandHeight = chunkArea > 0 ? chunkArea / rect.w : bandH;
      const finalBandHeight = isLastBand 
        ? availableHeight 
        : Math.min(bandH, Math.max(actualBandHeight, minBand));
      
      const bandRect: Rect = {
        x: rect.x,
        y,
        w: rect.w,
        h: finalBandHeight
      };
      
      const bandRects = squarifyStocks(chunk, bandRect, areaScale, targetAspect, { preferRows: true });
      
      // Renormalizuj výšky v pásu, aby presne vyplnil bandRect.h (odstráni prázdne medzery)
      if (bandRects.length > 0) {
        const maxY = Math.max(...bandRects.map(r => r.y + r.h));
        const actualHeight = maxY - bandRect.y;
        const heightScale = actualHeight > 0 ? bandRect.h / actualHeight : 1;
        
        if (Math.abs(heightScale - 1) > 0.001) {
          // Aplikuj scale len na výšky - šírky zostanú rovnaké
          bandRects.forEach(r => {
            r.y = bandRect.y + (r.y - bandRect.y) * heightScale;
            r.h *= heightScale;
          });
        }
        
        out.push(...bandRects);
      }
      
      y += finalBandHeight;
    } else {
      break;
    }
  }
  
  return out;
}

/**
 * Create mini-grid for micro items (too small to display individually)
 */
function createMiniGrid(
  micros: HeatItem[],
  otherRect: Rect,
  minCellSize: number
): Rect[] {
  if (micros.length === 0) return [];

  const cols = Math.max(2, Math.floor(otherRect.w / minCellSize));
  const rows = Math.ceil(micros.length / cols);
  const gw = otherRect.w / cols;
  const gh = otherRect.h / rows;

  const grid: Rect[] = [];
  micros.forEach((item, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    grid.push({
      x: otherRect.x + c * gw,
      y: otherRect.y + r * gh,
      w: gw,
      h: gh
    });
  });

  return grid;
}

