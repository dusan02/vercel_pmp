'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
  HierarchyNode,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';
import { formatMarketCapDiff } from '@/lib/format';

// --- TYPY ---

/**
 * Typ pre vstupné dáta jednej spoločnosti.
 */
export type CompanyNode = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: number;
  changePercent: number;
  marketCapDiff?: number; // Denný rozdiel v market cap (v miliardách)
};

/**
 * Props pre hlavný komponent heatmapy.
 */
export type MarketHeatmapProps = {
  data: CompanyNode[];
  onTileClick?: (company: CompanyNode) => void;
  /** Šírka komponentu v pixeloch. */
  width: number;
  /** Výška komponentu v pixeloch. */
  height: number;
  /** Aktuálny timeframe pre zobrazenie dát */
  timeframe?: 'day' | 'week' | 'month';
  /** Callback pre zmenu timeframe */
  onTimeframeChange?: (timeframe: 'day' | 'week' | 'month') => void;
};

/**
 * Interná štruktúra pre budovanie hierarchie, ktorú D3 očakáva.
 */
interface HierarchyData {
  name: string;
  children?: HierarchyData[];
  value?: number; // MarketCap pre listy
  meta?: {
    type: 'root' | 'sector' | 'industry' | 'company';
    companyData?: CompanyNode; // Plné dáta pre listy
  };
}

/**
 * Typ pre list (firmu) po spracovaní D3 layoutom.
 */
type TreemapLeaf = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  data: HierarchyData & {
    meta: {
      type: 'company';
      companyData: CompanyNode;
    };
  };
};

/**
 * Typ pre uzol (sektor/industry) po spracovaní D3 layoutom.
 */
type TreemapNode = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

// --- POMOCNÉ FUNKCIE ---

/**
 * Transformuje plochý zoznam firiem na hierarchickú štruktúru.
 * @param data Zoznam CompanyNode[]
 * @returns Koreňový uzol pre D3
 */
function buildHierarchy(data: CompanyNode[]): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  
  let skippedCount = 0;

  for (const company of data) {
    // Skontrolujme, či má firma platný marketCap (D3 ignoruje hodnoty <= 0)
    const marketCap = company.marketCap || 0;
    if (marketCap <= 0) {
      skippedCount++;
      continue; // Preskočíme firmy bez marketCap
    }

    // 1. Nájdi alebo vytvor Sektor
    let sectorNode = sectorMap.get(company.sector);
    if (!sectorNode) {
      sectorNode = { name: company.sector, children: [], meta: { type: 'sector' } };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    // 2. Nájdi alebo vytvor Industry
    const industryName = company.industry;
    let industryNode = sectorNode.children!.find((ind) => ind.name === industryName);
    if (!industryNode) {
      industryNode = {
        name: industryName,
        children: [],
        meta: { type: 'industry' },
      };
      sectorNode.children!.push(industryNode);
    }

    // 3. Pridaj list (Firmu)
    const companyLeaf: HierarchyData = {
      name: company.symbol,
      value: marketCap, // d3.sum() bude sčítať túto hodnotu
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    industryNode.children!.push(companyLeaf);
  }
  
  if (skippedCount > 0) {
    console.warn(`⚠️ buildHierarchy: Preskočených ${skippedCount} firiem bez marketCap z ${data.length} celkom`);
  }
  
  return root;
}

/**
 * Farebná škála pre percentuálnu zmenu.
 * Definuje prechod od červenej (pokles) po zelenú (rast).
 */
const createColorScale = (timeframe: 'day' | 'week' | 'month' = 'day') => {
  // Rôzne škály pre rôzne timeframy
  const scales = {
    day: {
      domain: [-5, -2, 0, 2, 5],
      range: ['#ef4444', '#f87171', '#374151', '#4ade80', '#22c55e'],
    },
    week: {
      domain: [-10, -5, 0, 5, 10],
      range: ['#dc2626', '#ef4444', '#374151', '#22c55e', '#16a34a'],
    },
    month: {
      domain: [-20, -10, 0, 10, 20],
      range: ['#b91c1c', '#dc2626', '#374151', '#16a34a', '#15803d'],
    },
  };

  const config = scales[timeframe];
  return scaleLinear<string>()
    .domain(config.domain)
    .range(config.range)
    .clamp(true);
};

/**
 * Formátuje percentuálnu zmenu.
 */
const formatPercent = (value: number) =>
  `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;

/**
 * Formátuje market cap na kompaktný tvar (napr. 1.2T alebo 350.5B).
 * Market cap je v miliardách, takže:
 * - >= 1000 miliárd = trilióny (T)
 * - < 1000 miliárd = miliardy (B)
 */
const formatMarketCap = (value: number) => {
  if (!isFinite(value) || value === 0) return '0.00';
  
  if (value >= 1000) {
    // Trilióny
    const trillions = value / 1000;
    return `${trillions.toFixed(2)}T`;
  } else {
    // Miliardy
    return `${value.toFixed(2)}B`;
  }
};

// --- KONFIGURÁCIA TEXTU V DLAŽDICIACH ---

/**
 * Konfigurácia textu pre dlaždicu podľa jej veľkosti
 */
type TileLabelConfig = {
  showSymbol: boolean;
  showPercent: boolean;
  symbolFontPx: number;
  percentFontPx?: number;
  align: 'center' | 'top-left';
};

/**
 * Obmedzí číslo na rozsah min-max
 */
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Vypočíta konfiguráciu textu pre dlaždicu podľa jej veľkosti
 * @param widthPx Šírka dlaždice v pixeloch
 * @param heightPx Výška dlaždice v pixeloch
 * @returns Konfigurácia textu
 */
function getTileLabelConfig(widthPx: number, heightPx: number): TileLabelConfig {
  const area = widthPx * heightPx;

  // 1) Extra small dlaždice – úplne bez textu (iba farba)
  //    => malé firmy nebudú „fake“ popísané miniatúrnym textom
  if (widthPx < 26 || heightPx < 18 || area < 450) {
    return {
      showSymbol: false,
      showPercent: false,
      symbolFontPx: 0,
      align: 'center',
    };
  }

  // 2) Small tiles – len ticker, ale čitateľný (min. 12 px)
  if (area < 1500) {
    const base = Math.min(widthPx, heightPx);
    const symbolFontPx = clampNumber(base * 0.6, 12, 16);
    return {
      showSymbol: true,
      showPercent: false,
      symbolFontPx,
      align: 'center',
    };
  }

  // 3) Medium tiles – ticker + % v strede, stále rozumné rozmery
  if (area < 4500) {
    const symbolFontPx = clampNumber(heightPx * 0.55, 14, 20);
    const percentFontPx = clampNumber(heightPx * 0.4, 11, 16);
    return {
      showSymbol: true,
      showPercent: true,
      symbolFontPx,
      percentFontPx,
      align: 'center',
    };
  }

  // 4) Big tiles – megacapy: veľký text hore-vľavo
  const symbolFontPx = clampNumber(heightPx * 0.6, 18, 26);
  const percentFontPx = clampNumber(heightPx * 0.45, 13, 18);
  return {
    showSymbol: true,
    showPercent: true,
    symbolFontPx,
    percentFontPx,
    align: 'top-left',
  };
}

// --- POD-KOMPONENTY ---

/**
 * Komponent pre Tooltip.
 */
type TooltipProps = {
  company: CompanyNode;
  position: { x: number; y: number };
  timeframe?: 'day' | 'week' | 'month';
};

const Tooltip: React.FC<TooltipProps> = ({ company, position, timeframe = 'day' }) => {
  return (
    <div
      className="absolute z-50 p-3 bg-slate-800 text-white rounded-lg shadow-xl pointer-events-none transition-opacity duration-100"
      style={{
        left: position.x + 15,
        top: position.y + 15,
      }}
    >
      <h3 className="font-bold text-lg">
        {company.symbol} - {company.name}
      </h3>
      <p className="text-sm text-slate-300">
        {company.sector} / {company.industry}
      </p>
      <div className="mt-2 border-t border-slate-700 pt-2 grid grid-cols-2 gap-x-4">
        <span className="text-slate-400">Change ({timeframe}):</span>
        <span
          className={`font-medium ${
            company.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {formatPercent(company.changePercent)}
        </span>
        <span className="text-slate-400">Market Cap:</span>
        <span className="font-medium">
          {formatMarketCap(company.marketCap)}
        </span>
        {company.marketCapDiff !== undefined && company.marketCapDiff !== null && (
          <>
            <span className="text-slate-400">Cap Diff ({timeframe}):</span>
            <span
              className={`font-medium ${
                company.marketCapDiff >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {formatMarketCapDiff(company.marketCapDiff)}B
            </span>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * Komponent pre Legendu.
 */
const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month' }> = ({ timeframe }) => {
  const colorScale = createColorScale(timeframe);
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const points = scales[timeframe];

  return (
    <div className="absolute bottom-4 left-4 flex items-center bg-gray-900 bg-opacity-70 p-2 rounded-lg pointer-events-none">
      <span className="text-white text-xs mr-3 font-medium">Decline</span>
      <div className="flex">
        {points.map((p) => (
          <div key={p} className="flex flex-col items-center">
            <div
              className="w-5 h-5 border-t border-b border-gray-700"
              style={{
                backgroundColor: colorScale(p),
                borderLeft: p === points[0] ? '1px solid #4b5563' : 'none',
                borderRight: p === points[points.length - 1] ? '1px solid #4b5563' : 'none',
              }}
            />
            <span className="text-white text-xs mt-1">{p}%</span>
          </div>
        ))}
      </div>
      <span className="text-white text-xs ml-3 font-medium">Growth</span>
    </div>
  );
};

// --- HLAVNÝ KOMPONENT ---

/**
 * Interaktívna Heatmapa akciového trhu.
 */
export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  data,
  width,
  height,
  onTileClick,
  timeframe = 'day',
  onTimeframeChange,
}) => {
  const [hoveredNode, setHoveredNode] = useState<CompanyNode | null>(null);
  const [hoveredSector, setHoveredSector] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [zoomedSector, setZoomedSector] = useState<string | null>(null);
  const [colorTransition, setColorTransition] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Animácia farieb pri zmene timeframe
  useEffect(() => {
    setColorTransition(true);
    const timer = setTimeout(() => setColorTransition(false), 500);
    return () => clearTimeout(timer);
  }, [timeframe]);

  // 1. Transformácia dát
  const hierarchyRoot = useMemo(() => buildHierarchy(data), [data]);

  // 2. Výpočet D3 Treemap layoutu
  const treemapLayout = useMemo(() => {
    if (width === 0 || height === 0) return null;

    // Vytvoríme D3 hierarchiu
    const d3Root = hierarchy(hierarchyRoot)
      .sum((d) => d.value || 0) // Sčítame 'value' (marketCap)
      .sort((a, b) => (b.value || 0) - (a.value || 0)); // Zoradíme

    // Vytvoríme generátor treemapy
    const treemapGenerator = treemap<HierarchyData>()
      .size([width, height])
      .paddingOuter(2) // Medzera okolo sektorov (zmenšená)
      .paddingTop(28) // Priestor pre nadpis sektora/industry (zväčšený pre lepšiu čitateľnosť)
      .paddingInner(0.5) // Medzera medzi jednotlivými dlaždicami (zmenšená)
      .tile(treemapSquarify); // Algoritmus pre "štvorcovejší" layout

    // Spustíme výpočet layoutu
    treemapGenerator(d3Root);
    return d3Root;
  }, [hierarchyRoot, width, height]);

  // Farebná škála pre aktuálny timeframe
  const colorScale = useMemo(() => createColorScale(timeframe), [timeframe]);

  // Handler pre pohyb myši (pre pozíciu tooltipu, relatívne k kontajneru)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  // Handler pre kliknutie na sektor (zoom)
  const handleSectorClick = useCallback((sectorName: string) => {
    setZoomedSector((prev) => (prev === sectorName ? null : sectorName));
  }, []);

  // Helper funkcia pre kontrolu, či uzol patrí do zoomovaného sektora
  const belongsToSector = useCallback((node: any, sectorName: string): boolean => {
    if (node.depth === 1) {
      return node.data.name === sectorName;
    }
    if (node.depth > 1) {
      let parent = node.parent;
      while (parent) {
        if (parent.depth === 1 && parent.data.name === sectorName) {
          return true;
        }
        parent = parent.parent;
      }
    }
    return false;
  }, []);

  // Získame všetky uzly (sektory, industry) a listy (firmy) - memoizované
  const allNodes = useMemo(() => {
    return treemapLayout ? treemapLayout.descendants() : [];
  }, [treemapLayout]);

  const allLeaves = useMemo(() => {
    const leaves = treemapLayout ? (treemapLayout.leaves() as TreemapLeaf[]) : [];
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 MarketHeatmap: Rendering ${leaves.length} companies from ${data.length} total companies`);
    }
    return leaves;
  }, [treemapLayout, data.length]);

  // Filtrovanie pre zoom na sektor
  const filteredNodes = useMemo(() => {
    return zoomedSector
      ? allNodes.filter((node) => belongsToSector(node, zoomedSector))
      : allNodes;
  }, [allNodes, zoomedSector, belongsToSector]);

  const filteredLeaves = useMemo(() => {
    return zoomedSector
      ? allLeaves.filter((leaf) => belongsToSector(leaf, zoomedSector))
      : allLeaves;
  }, [allLeaves, zoomedSector, belongsToSector]);

  if (width === 0 || height === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black text-gray-500">
        Loading layout...
      </div>
    );
  }

  // Vypočítame rozsah treemapy (spoločný výpočet pre scale a offset)
  const treemapBounds = useMemo(() => {
    if (!treemapLayout || width === 0 || height === 0) return null;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    treemapLayout.descendants().forEach((node: any) => {
      if (node.x0 !== undefined) {
        minX = Math.min(minX, node.x0);
        minY = Math.min(minY, node.y0);
        maxX = Math.max(maxX, node.x1);
        maxY = Math.max(maxY, node.y1);
      }
    });
    
    const treemapWidth = maxX - minX;
    const treemapHeight = maxY - minY;
    
    if (treemapWidth === 0 || treemapHeight === 0) return null;
    
    return { minX, minY, maxX, maxY, treemapWidth, treemapHeight };
  }, [treemapLayout, width, height]);

  // Vypočítame skálovanie pre zobrazenie celej mapy
  const scale = useMemo(() => {
    if (!treemapBounds) return 1;
    
    // Vypočítame skálu, aby sa mapa zmestila s 15% okrajom (zmenšená mapa)
    const scaleX = (width * 0.85) / treemapBounds.treemapWidth;
    const scaleY = (height * 0.85) / treemapBounds.treemapHeight;
    return Math.min(scaleX, scaleY, 1); // Nezvětšujeme, iba zmenšujeme ak je potrebné
  }, [treemapBounds, width, height]);

  // Offset pre centrovanie
  const offset = useMemo(() => {
    if (!treemapBounds || scale === 0) return { x: 0, y: 0 };
    
    const treemapWidth = treemapBounds.treemapWidth * scale;
    const treemapHeight = treemapBounds.treemapHeight * scale;
    
    return {
      x: (width - treemapWidth) / 2 - treemapBounds.minX * scale,
      y: (height - treemapHeight) / 2 - treemapBounds.minY * scale,
    };
  }, [treemapBounds, width, height, scale]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      style={{ overflow: 'hidden' }}
      onMouseMove={handleMouseMove}
    >
      {/* Zoom back button */}
      {zoomedSector && (
        <button
          onClick={() => setZoomedSector(null)}
          className="absolute top-4 left-4 z-40 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          ← Back to All Sectors
        </button>
      )}

      {/* 1. Renderujeme Sektory a Industry (ako nadpisy) */}
      {filteredNodes
        .filter((node) => node.depth === 1 || node.depth === 2) // Iba Sektory a Industry
        .map((node) => {
          const { x0, y0, x1, y1 } = node as TreemapNode;
          const data = node.data as HierarchyData;
          const nodeWidth = x1 - x0;
          const nodeHeight = y1 - y0;
          const isSector = node.depth === 1;
          const isHovered = isSector && hoveredSector === data.name;

          // Vypočítame skálovanú veľkosť
          const scaledWidth = nodeWidth * scale;
          const scaledHeight = nodeHeight * scale;

          // Skryj veľmi malé industry labely (upravené pre scale)
          if (node.depth === 2 && (scaledWidth < 40 || scaledHeight < 15)) {
            return null;
          }

          // Dynamická veľkosť textu podľa veľkosti dlaždice (upravené pre lepšiu UX)
          let fontSize: string;
          let padding: string;
          if (isSector) {
            // Sektory - zmenšené prahy pre menšie texty
            if (scaledWidth > 300 && scaledHeight > 120) {
              fontSize = 'text-lg';
              padding = 'pt-1 px-2 py-1';
            } else if (scaledWidth > 180 && scaledHeight > 70) {
              fontSize = 'text-base';
              padding = 'pt-0.5 px-1.5 py-0.5';
            } else {
              fontSize = 'text-sm';
              padding = 'pt-0.5 px-1 py-0.5';
            }
          } else {
            // Industry - zmenšené prahy pre menšie texty
            if (scaledWidth > 200 && scaledHeight > 80) {
              fontSize = 'text-base';
              padding = 'pt-1 px-1.5 py-0.5';
            } else if (scaledWidth > 100 && scaledHeight > 40) {
              fontSize = 'text-sm';
              padding = 'pt-0.5 px-1 py-0.5';
            } else {
              fontSize = 'text-xs';
              padding = 'pt-0.5 px-1 py-0.5';
            }
          }

          return (
            <div
              key={`${node.depth}-${data.name}-${x0}-${y0}`}
              className={`absolute overflow-hidden ${
                isSector ? 'cursor-pointer' : 'pointer-events-none'
              }`}
              style={{
                left: x0 * scale + offset.x,
                top: y0 * scale + offset.y,
                width: nodeWidth * scale,
                height: nodeHeight * scale,
              }}
              onMouseEnter={() => isSector && setHoveredSector(data.name)}
              onMouseLeave={() => isSector && setHoveredSector(null)}
              onClick={() => isSector && handleSectorClick(data.name)}
            >
              {/* Nadpis (D3 padding nám dal miesto hore) */}
              <div
                className={`absolute top-0 left-1 z-50 font-bold uppercase transition-colors duration-200 ${
                  isSector
                    ? `${fontSize} ${padding} ${isHovered ? 'text-blue-400' : 'text-white'}`
                    : `${fontSize} ${padding} text-white`
                }`}
                style={{
                  textShadow: '3px 3px 6px rgba(0, 0, 0, 1), 0 0 12px rgba(0, 0, 0, 0.8)',
                  backgroundColor: isSector ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.65)',
                  borderRadius: '4px',
                  lineHeight: '1.2',
                  letterSpacing: '0.05em',
                }}
              >
                {data.name}
              </div>

              {/* Hover overlay pre sektor */}
              {isSector && isHovered && (
                <div className="absolute inset-0 bg-blue-500 opacity-10 pointer-events-none" />
              )}
            </div>
          );
        })}

      {/* 2. Renderujeme Listy (Firmy) */}
      {filteredLeaves.map((leaf) => {
        const { x0, y0, x1, y1 } = leaf;
        const tileWidth = x1 - x0;
        const tileHeight = y1 - y0;
        const company = leaf.data.meta.companyData;
        const tileColor = colorScale(company.changePercent);

        // Skutočné rozmery dlaždice v pixeloch
        const scaledWidth = tileWidth * scale;
        const scaledHeight = tileHeight * scale;

        // Konfigurácia textu podľa veľkosti dlaždice
        const {
          showSymbol,
          showPercent,
          symbolFontPx,
          percentFontPx,
          align,
        } = getTileLabelConfig(scaledWidth, scaledHeight);

        return (
          <div
            key={`${company.symbol}-${x0}-${y0}`}
            className="absolute flex flex-col items-center justify-center p-1 box-border transition-all duration-300 ease-out cursor-pointer group"
            style={{
              left: x0 * scale + offset.x,
              top: y0 * scale + offset.y,
              width: tileWidth * scale,
              height: tileHeight * scale,
              backgroundColor: tileColor,
              transitionProperty: colorTransition ? 'background-color' : 'all',
            }}
            onMouseEnter={() => setHoveredNode(company)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => onTileClick && onTileClick(company)}
          >
            {/* Text v dlaždici */}
            {(showSymbol || showPercent) && (
              <div
                className={`relative z-10 flex flex-col w-full h-full transition-opacity opacity-90 group-hover:opacity-100 ${
                  align === 'center'
                    ? 'items-center justify-center'
                    : 'items-start justify-start'
                }`}
                style={align === 'top-left' ? { padding: 4 } : undefined}
              >
                {showSymbol && (
                  <div
                    className="font-bold text-white leading-tight tracking-tight"
                    style={{
                      fontSize: symbolFontPx,
                      lineHeight: 1.05,
                      WebkitTextStroke: '0.6px rgba(0,0,0,0.9)', // hrana textu, lepšie na svetlozelenej
                    }}
                  >
                    {company.symbol}
                  </div>
                )}
                {showPercent && typeof percentFontPx === 'number' && (
                  <div
                    className="text-white/90 font-medium leading-tight mt-0.5"
                    style={{
                      fontSize: percentFontPx,
                      lineHeight: 1.05,
                      WebkitTextStroke: '0.4px rgba(0,0,0,0.85)',
                    }}
                  >
                    {formatPercent(company.changePercent)}
                  </div>
                )}
              </div>
            )}
            {/* Jemné zosvetlenie pozadia pri hoveri */}
            <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-100" />
          </div>
        );
      })}

      {/* 3. Legenda */}
      <HeatmapLegend timeframe={timeframe} />

      {/* 4. Tooltip (renderuje sa mimo) */}
      {hoveredNode && (
        <Tooltip company={hoveredNode} position={mousePosition} timeframe={timeframe} />
      )}
    </div>
  );
};

// --- Hook na sledovanie veľkosti rodičovského elementu ---

/**
 * Custom hook, ktorý používa ResizeObserver na sledovanie veľkosti elementu.
 * @returns Ref, ktorý sa má pripojiť na element, a jeho aktuálna veľkosť.
 */
export function useElementResize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
}

