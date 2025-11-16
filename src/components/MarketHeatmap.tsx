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

  for (const company of data) {
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
      value: company.marketCap, // d3.sum() bude sčítať túto hodnotu
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    industryNode.children!.push(companyLeaf);
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

/**
 * Komponent pre Timeframe selector.
 */
const TimeframeSelector: React.FC<{
  timeframe: 'day' | 'week' | 'month';
  onChange: (timeframe: 'day' | 'week' | 'month') => void;
}> = ({ timeframe, onChange }) => {
  return (
    <div className="absolute top-4 right-4 flex items-center bg-gray-900 bg-opacity-70 p-1 rounded-lg">
      {(['day', 'week', 'month'] as const).map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className={`px-3 py-1 text-xs font-medium rounded transition-all duration-200 ${
            timeframe === tf
              ? 'bg-blue-600 text-white'
              : 'text-gray-300 hover:text-white hover:bg-gray-700'
          }`}
        >
          {tf.charAt(0).toUpperCase() + tf.slice(1)}
        </button>
      ))}
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
      .paddingOuter(3) // Medzera okolo sektorov
      .paddingTop(18) // Priestor pre nadpis sektora/industry
      .paddingInner(1) // Medzera medzi jednotlivými dlaždicami
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

  // Získame všetky uzly (sektory, industry) a listy (firmy)
  const allNodes = treemapLayout ? treemapLayout.descendants() : [];
  const allLeaves = treemapLayout ? (treemapLayout.leaves() as TreemapLeaf[]) : [];

  // Filtrovanie pre zoom na sektor
  const filteredNodes = zoomedSector
    ? allNodes.filter((node) => {
        if (node.depth === 1) {
          return node.data.name === zoomedSector;
        }
        if (node.depth > 1) {
          // Kontrola, či patrí do zoomovaného sektora
          let parent = node.parent;
          while (parent) {
            if (parent.depth === 1 && parent.data.name === zoomedSector) {
              return true;
            }
            parent = parent.parent;
          }
        }
        return false;
      })
    : allNodes;

  const filteredLeaves = zoomedSector
    ? allLeaves.filter((leaf) => {
        let parent = leaf.parent;
        while (parent) {
          if (parent.depth === 1 && parent.data.name === zoomedSector) {
            return true;
          }
          parent = parent.parent;
        }
        return false;
      })
    : allLeaves;

  if (width === 0 || height === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-black text-gray-500">
        Loading layout...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      onMouseMove={handleMouseMove}
    >
      {/* Timeframe selector */}
      {onTimeframeChange && (
        <TimeframeSelector timeframe={timeframe} onChange={onTimeframeChange} />
      )}

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

          // Skryj veľmi malé industry labely
          if (node.depth === 2 && (nodeWidth < 60 || nodeHeight < 20)) {
            return null;
          }

          return (
            <div
              key={`${node.depth}-${data.name}-${x0}-${y0}`}
              className={`absolute overflow-hidden ${
                isSector ? 'cursor-pointer' : 'pointer-events-none'
              }`}
              style={{
                left: x0,
                top: y0,
                width: nodeWidth,
                height: nodeHeight,
              }}
              onMouseEnter={() => isSector && setHoveredSector(data.name)}
              onMouseLeave={() => isSector && setHoveredSector(null)}
              onClick={() => isSector && handleSectorClick(data.name)}
            >
              {/* Nadpis (D3 padding nám dal miesto hore) */}
              <div
                className={`absolute top-0 left-1 ${
                  isSector
                    ? `text-sm font-bold pt-0.5 ${isHovered ? 'text-blue-400' : 'text-gray-300'}`
                    : 'text-xs pt-1 text-gray-300'
                } uppercase transition-colors duration-200`}
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

        // Logika pre zobrazenie textu podľa veľkosti
        const showLargeText = tileWidth > 80 && tileHeight > 50;
        const showSmallText = tileWidth > 35 && tileHeight > 20;

        return (
          <div
            key={`${company.symbol}-${x0}-${y0}`}
            className="absolute flex flex-col items-center justify-center p-1 box-border transition-all duration-300 ease-out cursor-pointer group"
            style={{
              left: x0,
              top: y0,
              width: tileWidth,
              height: tileHeight,
              backgroundColor: tileColor,
              transitionProperty: colorTransition ? 'background-color' : 'all',
            }}
            onMouseEnter={() => setHoveredNode(company)}
            onMouseLeave={() => setHoveredNode(null)}
            onClick={() => onTileClick && onTileClick(company)}
          >
            {/* Obal pre text, ktorý zosvetlí/zosilní na hover */}
            <div className="relative z-10 flex flex-col items-center justify-center w-full h-full transition-opacity opacity-90 group-hover:opacity-100">
              {showLargeText && (
                <>
                  <div className="font-bold text-white text-lg drop-shadow">
                    {company.symbol}
                  </div>
                  <div className="text-sm text-white drop-shadow">
                    {formatPercent(company.changePercent)}
                  </div>
                </>
              )}
              {!showLargeText && showSmallText && (
                <div className="font-bold text-white text-sm drop-shadow">
                  {company.symbol}
                </div>
              )}
            </div>
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

