/**
 * Treemap Layout Algorithm
 * Implements squarified treemap algorithm for sector-based stock visualization
 */

export interface TreemapNode {
  x: number;
  y: number;
  width: number;
  height: number;
  data: any;
  sector?: string;
}

export interface TreemapItem {
  value: number; // Market cap
  data: any; // Stock data
  sector?: string;
}

/**
 * Calculate treemap layout using simple row-based algorithm
 * @param items Array of items with values (market cap)
 * @param width Container width
 * @param height Container height
 * @returns Array of nodes with positions and dimensions
 */
export function calculateTreemap(
  items: TreemapItem[],
  width: number,
  height: number
): TreemapNode[] {
  if (items.length === 0) return [];
  
  // Sort items by value (descending)
  const sorted = [...items].sort((a, b) => b.value - a.value);
  
  // Calculate total value
  const totalValue = sorted.reduce((sum, item) => sum + item.value, 0);
  
  if (totalValue === 0) return [];
  
  const nodes: TreemapNode[] = [];
  let currentY = 0;
  const minBlockSize = 20; // Minimum block size in pixels
  
  // Simple row-based layout
  let currentRow: TreemapItem[] = [];
  let currentRowValue = 0;
  
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    currentRow.push(item);
    currentRowValue += item.value;
    
    // Calculate row height based on total value
    const rowHeight = (currentRowValue / totalValue) * height;
    
    // Check if we should finalize this row
    const isLastItem = i === sorted.length - 1;
    const wouldNextRowBeTooSmall = !isLastItem && 
      ((sorted[i + 1].value / totalValue) * height) < minBlockSize;
    
    if (isLastItem || wouldNextRowBeTooSmall || currentRow.length >= Math.ceil(Math.sqrt(sorted.length))) {
      // Finalize current row
      let currentX = 0;
      for (const rowItem of currentRow) {
        const itemWidth = (rowItem.value / currentRowValue) * width;
        const itemHeight = rowHeight;
        
        nodes.push({
          x: currentX,
          y: currentY,
          width: itemWidth,
          height: itemHeight,
          data: rowItem.data,
          sector: rowItem.sector
        });
        
        currentX += itemWidth;
      }
      
      currentY += rowHeight;
      currentRow = [];
      currentRowValue = 0;
    }
  }
  
  return nodes;
}

/**
 * Group items by sector and calculate treemap for each sector
 * @param sectors Array of sector groups
 * @param containerWidth Container width
 * @param containerHeight Container height
 * @returns Array of sector treemaps with positioned nodes
 */
export function calculateSectorTreemap(
  sectors: Array<{ sector: string; stocks: any[]; totalMarketCap: number }>,
  containerWidth: number,
  containerHeight: number
): Array<{
  sector: string;
  nodes: TreemapNode[];
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  // Sort sectors by total market cap (largest first)
  const sortedSectors = [...sectors].sort((a, b) => b.totalMarketCap - a.totalMarketCap);
  
  // Calculate total market cap
  const totalMarketCap = sortedSectors.reduce((sum, s) => sum + s.totalMarketCap, 0);
  
  // Calculate sector areas based on market cap proportion
  const sectorAreas = sortedSectors.map(sector => ({
    sector: sector.sector,
    area: (sector.totalMarketCap / totalMarketCap) * containerWidth * containerHeight,
    stocks: sector.stocks,
    totalMarketCap: sector.totalMarketCap
  }));
  
  // Simple layout: arrange sectors in rows
  const result: Array<{
    sector: string;
    nodes: TreemapNode[];
    x: number;
    y: number;
    width: number;
    height: number;
  }> = [];
  
  let currentY = 0;
  const rowHeight = containerHeight / sortedSectors.length;
  
  for (const sectorArea of sectorAreas) {
    const sectorWidth = containerWidth;
    const sectorHeight = rowHeight;
    
    // Calculate treemap for stocks in this sector
    const stockItems: TreemapItem[] = sectorArea.stocks.map(stock => ({
      value: stock.marketCap,
      data: stock,
      sector: sectorArea.sector
    }));
    
    const nodes = calculateTreemap(stockItems, sectorWidth, sectorHeight);
    
    // Adjust node positions relative to sector position
    const adjustedNodes = nodes.map(node => ({
      ...node,
      y: node.y + currentY
    }));
    
    result.push({
      sector: sectorArea.sector,
      nodes: adjustedNodes,
      x: 0,
      y: currentY,
      width: sectorWidth,
      height: sectorHeight
    });
    
    currentY += sectorHeight;
  }
  
  return result;
}

/**
 * Get color based on percent change
 * @param percentChange Percentage change (can be negative)
 * @returns RGB color string
 */
export function getColorForChange(percentChange: number): string {
  if (percentChange > 0) {
    // Green for positive changes
    // Intensity based on change (max at 10% = full green)
    const intensity = Math.min(percentChange / 10, 1);
    const green = Math.round(100 + intensity * 155); // 100-255
    return `rgb(0, ${green}, 0)`;
  } else if (percentChange < 0) {
    // Red for negative changes
    const intensity = Math.min(Math.abs(percentChange) / 10, 1);
    const red = Math.round(100 + intensity * 155); // 100-255
    return `rgb(${red}, 0, 0)`;
  } else {
    // Gray for no change
    return 'rgb(128, 128, 128)';
  }
}

