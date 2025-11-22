'use client';

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  hierarchy,
  treemap,
  treemapSquarify,
  HierarchyNode,
} from 'd3-hierarchy';
import { scaleLinear } from 'd3-scale';

import { CanvasHeatmap } from './CanvasHeatmap';

// --- KONŠTANTY ---

/**
 * Konštanty pre veľkosti a thresholdy dlaždíc
 */
const TILE_SIZE_THRESHOLDS = {
  MIN_WIDTH: 30,
  MIN_HEIGHT: 20,
  MIN_AREA: 900, // Najmenšia plocha - bez textu
  SMALL_AREA: 2500, // Menšia plocha - len ticker (menší font)
  MEDIUM_AREA: 5000, // Malá plocha - len ticker (väčší font)
  LARGE_AREA: 10000, // Stredná plocha - ticker + % change
  MIN_INDUSTRY_WIDTH: 140,
  MIN_INDUSTRY_HEIGHT: 50,
} as const;

/**
 * Konštanty pre font sizing - úmerné škálovanie podľa plochy
 */
const FONT_SIZE_CONFIG = {
  // Minimálna veľkosť písma pre čitateľnosť
  MIN_READABLE_SIZE: 8, // Znížené z 10px - najmenší čitateľný font
  MIN_SYMBOL_SIZE: 8, // Znížené z 11px - minimálna veľkosť pre ticker
  MIN_PERCENT_SIZE: 7, // Znížené z 9px - minimálna veľkosť pre % change

  // Maximálna veľkosť písma
  MAX_SYMBOL_SIZE: 28, // Maximálna veľkosť pre ticker
  MAX_PERCENT_SIZE: 20, // Maximálna veľkosť pre % change

  // Multiplikátory pre výpočet veľkosti písma z plochy
  // Použijeme logaritmickú škálu pre plynulejší prechod
  AREA_TO_FONT_BASE: 0.15, // Základný koeficient pre výpočet z plochy
  AREA_TO_FONT_LOG_BASE: 2.5, // Logaritmická báza pre plynulejší prechod
} as const;

/**
 * Konštanty pre layout a positioning
 */
const LAYOUT_CONFIG = {
  SCALE_MARGIN: 0.85, // 15% okraj pri scale výpočte
  TOOLTIP_OFFSET: 15, // Offset tooltipu od kurzora
  SECTOR_GAP: 4, // Jednotná medzera medzi sektormi (v pixeloch) - čierna farba
  SECTOR_LABEL: {
    FONT_SIZE: 14,
    PADDING: '2px 6px',
    TOP: 2,
    LEFT: 6,
    LETTER_SPACING: '0.08em',
    BG_OPACITY: 0.85,
  },
  INDUSTRY_LABEL: {
    FONT_SIZE: 11,
    PADDING: '1px 4px',
    TOP: 4,
    LEFT: 6,
    LETTER_SPACING: '0.04em',
    BG_OPACITY: 0.65,
  },
} as const;

/**
 * Text shadow pre čitateľnosť textu na dlaždiciach
 */
const TEXT_SHADOW = `
  -0.5px -0.5px 0 rgba(0,0,0,1),
  0.5px -0.5px 0 rgba(0,0,0,1),
  -0.5px 0.5px 0 rgba(0,0,0,1),
  0.5px 0.5px 0 rgba(0,0,0,1),
  0 0 0.5px rgba(0,0,0,1),
  0 0 1px rgba(0,0,0,0.9)
`.trim();

/**
 * Text shadow pre sektor/industry labely
 */
const LABEL_TEXT_SHADOW = '2px 2px 4px rgba(0,0,0,0.9)';

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
  marketCapDiff?: number; // Denný rozdiel v market cap (nominálna hodnota v $)
  marketCapDiffAbs?: number; // Absolútna hodnota marketCapDiff pre veľkosť dlaždice
  currentPrice?: number; // Aktuálna cena akcie
};

/**
 * Typ pre metriku heatmapy - podľa čoho sa počíta veľkosť dlaždice
 */
export type HeatmapMetric = 'percent' | 'mcap';

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
  /** Metrika pre výpočet veľkosti dlaždice */
  metric?: HeatmapMetric;
};

/**
 * Interná štruktúra pre budovanie hierarchie, ktorú D3 očakáva.
 */
export interface HierarchyData {
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
export type TreemapLeaf = HierarchyNode<HierarchyData> & {
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
export type TreemapNode = HierarchyNode<HierarchyData> & {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

// --- POMOCNÉ FUNKCIE ---

/**
 * Transformuje plochý zoznam firiem na hierarchickú štruktúru.
 * @param data Zoznam CompanyNode[]
 * @param metric Metrika pre výpočet veľkosti dlaždice
 * @returns Koreňový uzol pre D3
 */
function buildHierarchy(data: CompanyNode[], metric: HeatmapMetric = 'percent'): HierarchyData {
  const root: HierarchyData = { name: 'Market', children: [], meta: { type: 'root' } };
  const sectorMap = new Map<string, HierarchyData>();
  const industryMap = new Map<string, HierarchyData>(); // Map pre industries (key: sector-industry)

  let skippedCount = 0;

  for (const company of data) {
    // Podľa metriky vyberieme hodnotu pre veľkosť dlaždice
    let tileValue: number;
    if (metric === 'mcap') {
      // V režime Market Cap Change používame absolútnu hodnotu marketCapDiff
      tileValue = company.marketCapDiffAbs || Math.abs(company.marketCapDiff || 0);
    } else {
      // V režime % Change používame marketCap (pôvodné správanie)
      tileValue = company.marketCap || 0;
    }

    // Skontrolujme, či má firma platnú hodnotu (D3 ignoruje hodnoty <= 0)
    if (tileValue <= 0) {
      skippedCount++;
      continue; // Preskočíme firmy bez platnej hodnoty
    }

    // 1. Nájdi alebo vytvor Sektor
    let sectorNode = sectorMap.get(company.sector);
    if (!sectorNode) {
      sectorNode = { name: company.sector, children: [], meta: { type: 'sector' } };
      sectorMap.set(company.sector, sectorNode);
      root.children!.push(sectorNode);
    }

    // 2. Nájdi alebo vytvor Industry (priamo pod sektorom)
    // Použijeme kombinovaný kľúč pre jednoznačnú identifikáciu industry v rámci sektora
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

    // 3. Pridaj list (Firmu) priamo pod industry
    const companyLeaf: HierarchyData = {
      name: company.symbol,
      value: tileValue, // d3.sum() bude sčítať túto hodnotu (marketCap alebo marketCapDiffAbs)
      meta: {
        type: 'company',
        companyData: company,
      },
    };
    industryNode.children!.push(companyLeaf);
  }

  if (skippedCount > 0) {
    const metricName = metric === 'mcap' ? 'marketCapDiffAbs' : 'marketCap';
    console.warn(`⚠️ buildHierarchy: Preskočených ${skippedCount} firiem bez ${metricName} z ${data.length} celkom`);
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
 * Formátuje market cap diff na kompaktný tvar (napr. +$34.2B alebo -$1.5B).
 */
const formatMarketCapDiff = (value: number | undefined): string => {
  if (value === undefined || value === null || !isFinite(value) || value === 0) {
    return '';
  }
  const absValue = Math.abs(value);
  const sign = value >= 0 ? '+' : '-';

  if (absValue >= 1_000_000_000_000) {
    // Trillions
    return `${sign}$${(absValue / 1_000_000_000_000).toFixed(1)}T`;
  } else if (absValue >= 1_000_000_000) {
    // Billions
    return `${sign}$${(absValue / 1_000_000_000).toFixed(1)}B`;
  } else if (absValue >= 1_000_000) {
    // Millions
    return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`;
  } else {
    return `${sign}$${absValue.toFixed(0)}`;
  }
};

/**
 * Formátuje cenu akcie na formát s dolármi (napr. $185.50).
 */
const formatPrice = (value: number | undefined): string => {
  if (value === undefined || value === null || !isFinite(value) || value === 0) {
    return '';
  }
  return `$${value.toFixed(2)}`;
};

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
 * Vypočíta veľkosť písma na základe plochy dlaždice
 * Používa logaritmickú škálu pre plynulejší prechod medzi veľkosťami
 * @param area Plocha dlaždice v px²
 * @param minSize Minimálna veľkosť písma
 * @param maxSize Maximálna veľkosť písma
 * @returns Veľkosť písma v px
 */
function calculateFontSizeFromArea(
  area: number,
  minSize: number,
  maxSize: number
): number {
  // Použijeme logaritmickú škálu pre plynulejší prechod
  // Vzorec: minSize + (maxSize - minSize) * log(area / minArea) / log(maxArea / minArea)
  const minArea = TILE_SIZE_THRESHOLDS.MIN_AREA;
  const maxArea = TILE_SIZE_THRESHOLDS.LARGE_AREA * 2; // Rozšírený max pre veľké dlaždice

  if (area <= minArea) {
    return minSize;
  }

  // Logaritmická škála
  const logArea = Math.log(area / minArea);
  const logMaxArea = Math.log(maxArea / minArea);
  const ratio = Math.min(logArea / logMaxArea, 1); // Obmedzíme na 0-1

  const fontSize = minSize + (maxSize - minSize) * ratio;
  return clampNumber(fontSize, minSize, maxSize);
}

/**
 * Vypočíta konfiguráciu textu pre dlaždicu podľa jej veľkosti
 * Písmo sa úmerne zmenšuje s plochou, ale zostáva čitateľné
 * @param widthPx Šírka dlaždice v pixeloch
 * @param heightPx Výška dlaždice v pixeloch
 * @returns Konfigurácia textu
 */
function getTileLabelConfig(widthPx: number, heightPx: number): TileLabelConfig {
  const area = widthPx * heightPx;
  const minDimension = Math.min(widthPx, heightPx);

  // 1) Najmenšia plocha – bez textu (iba farba)
  //    tu sa budeme spoliehať na tooltip
  if (
    widthPx < TILE_SIZE_THRESHOLDS.MIN_WIDTH ||
    heightPx < TILE_SIZE_THRESHOLDS.MIN_HEIGHT ||
    area < TILE_SIZE_THRESHOLDS.MIN_AREA
  ) {
    return {
      showSymbol: false,
      showPercent: false,
      symbolFontPx: 0,
      align: 'center',
    };
  }

  // 2) Menšia plocha – len ticker (menší font, ale čitateľný)
  //    Plocha: MIN_AREA až SMALL_AREA
  if (area < TILE_SIZE_THRESHOLDS.SMALL_AREA) {
    // Agresívnejšie zmenšovanie pre menšie dlaždice
    // Použijeme lineárnu škálu namiesto logaritmickej pre presnejšie zmenšovanie
    const minArea = TILE_SIZE_THRESHOLDS.MIN_AREA;
    const maxArea = TILE_SIZE_THRESHOLDS.SMALL_AREA;
    const ratio = Math.min((area - minArea) / (maxArea - minArea), 1);
    const minFont = 8; // Znížené z 11px na 8px pre menšie dlaždice
    const maxFont = 11; // Znížené z 14px na 11px
    const symbolFontPx = minFont + (maxFont - minFont) * ratio;
    return {
      showSymbol: true,
      showPercent: false,
      symbolFontPx: Math.round(symbolFontPx),
      align: 'center',
    };
  }

  // 3) Malá plocha – len ticker (väčší font)
  //    Plocha: SMALL_AREA až MEDIUM_AREA
  if (area < TILE_SIZE_THRESHOLDS.MEDIUM_AREA) {
    // Agresívnejšie zmenšovanie pre stredné dlaždice
    const minArea = TILE_SIZE_THRESHOLDS.SMALL_AREA;
    const maxArea = TILE_SIZE_THRESHOLDS.MEDIUM_AREA;
    const ratio = Math.min((area - minArea) / (maxArea - minArea), 1);
    const minFont = 10; // Znížené z 13px na 10px
    const maxFont = 14; // Znížené z 17px na 14px
    const symbolFontPx = minFont + (maxFont - minFont) * ratio;
    return {
      showSymbol: true,
      showPercent: false,
      symbolFontPx: Math.round(symbolFontPx),
      align: 'center',
    };
  }

  // 4) Stredná plocha – ticker + % change
  //    Plocha: MEDIUM_AREA až LARGE_AREA
  if (area < TILE_SIZE_THRESHOLDS.LARGE_AREA) {
    const symbolFontPx = calculateFontSizeFromArea(
      area,
      FONT_SIZE_CONFIG.MIN_SYMBOL_SIZE + 5, // 13px (znížené z 15px)
      FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 8 // 20px
    );
    const percentFontPx = calculateFontSizeFromArea(
      area,
      FONT_SIZE_CONFIG.MIN_PERCENT_SIZE, // 7px (znížené z 9px)
      FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4 // 16px
    );
    return {
      showSymbol: true,
      showPercent: true,
      symbolFontPx: Math.round(symbolFontPx),
      percentFontPx: Math.round(percentFontPx),
      align: 'center',
    };
  }

  // 5) Veľká plocha – ticker + % change (maximálna veľkosť)
  //    Plocha: LARGE_AREA+
  const symbolFontPx = calculateFontSizeFromArea(
    area,
    FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE - 6, // 22px
    FONT_SIZE_CONFIG.MAX_SYMBOL_SIZE // 28px
  );
  const percentFontPx = calculateFontSizeFromArea(
    area,
    FONT_SIZE_CONFIG.MAX_PERCENT_SIZE - 4, // 16px
    FONT_SIZE_CONFIG.MAX_PERCENT_SIZE // 20px
  );

  return {
    showSymbol: true,
    showPercent: true,
    symbolFontPx: Math.round(symbolFontPx),
    percentFontPx: Math.round(percentFontPx),
    align: 'center',
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
  // Odstránime duplicitu tickera - ak name je rovnaké ako symbol, zobrazíme iba symbol
  const displayName = company.name && company.name !== company.symbol
    ? `${company.symbol} - ${company.name}`
    : company.symbol;

  return (
    <div
      className="absolute z-50 p-3 bg-slate-800 text-white rounded-lg shadow-xl pointer-events-none transition-opacity duration-100"
      style={{
        left: position.x + LAYOUT_CONFIG.TOOLTIP_OFFSET,
        top: position.y + LAYOUT_CONFIG.TOOLTIP_OFFSET,
      }}
    >
      {/* Horná časť: Ticker a Sector / Industry */}
      <h3 className="font-bold text-lg">
        {displayName}
      </h3>
      <p className="text-sm text-slate-300">
        {company.sector} / {company.industry}
      </p>

      {/* Dolná časť: Price + Change, Market Cap + Cap Diff */}
      <div className="mt-2 border-t border-slate-700 pt-2 space-y-1">
        {/* Price a Change na jednom riadku */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Price</span>
          {company.currentPrice && (
            <span className="font-medium">{formatPrice(company.currentPrice)}</span>
          )}
          <span className="text-slate-400">,</span>
          <span
            className={`font-medium ${company.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
          >
            {formatPercent(company.changePercent)}
          </span>
        </div>

        {/* Market Cap a Cap Diff na jednom riadku */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">MktCap</span>
          <span className="font-medium">{formatMarketCap(company.marketCap)}</span>
          {company.marketCapDiff !== undefined && company.marketCapDiff !== null && (
            <>
              <span className="text-slate-400">,</span>
              <span
                className={`font-medium ${company.marketCapDiff >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
              >
                {formatMarketCapDiff(company.marketCapDiff)}B
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Komponent pre Legendu.
 * Exportovaný, aby sa mohol použiť aj v page komponente.
 */
export const HeatmapLegend: React.FC<{ timeframe: 'day' | 'week' | 'month' }> = ({ timeframe }) => {
  const colorScale = createColorScale(timeframe);
  const scales = {
    day: [-5, -3, -1, 0, 1, 3, 5],
    week: [-10, -6, -3, 0, 3, 6, 10],
    month: [-20, -12, -6, 0, 6, 12, 20],
  };
  const points = scales[timeframe];

  return (
    <div className="flex items-center bg-gray-900 bg-opacity-70 px-3 py-1.5 rounded-lg">
      <span className="text-white text-xs mr-2 font-medium">Decline</span>
      <div className="flex">
        {points.map((p) => (
          <div key={p} className="flex flex-col items-center">
            <div
              className="w-4 h-4 border-t border-b border-gray-700"
              style={{
                backgroundColor: colorScale(p),
                borderLeft: p === points[0] ? '1px solid #4b5563' : 'none',
                borderRight: p === points[points.length - 1] ? '1px solid #4b5563' : 'none',
              }}
            />
            <span className="text-white text-[10px] mt-0.5 leading-tight">{p}%</span>
          </div>
        ))}
      </div>
      <span className="text-white text-xs ml-2 font-medium">Growth</span>
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
  metric = 'percent',
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
  const hierarchyRoot = useMemo(() => buildHierarchy(data, metric), [data, metric]);

  // 2. Výpočet D3 Treemap layoutu
  // Optimized: Round width/height to nearest 10px to prevent recalculation on tiny resizes
  const treemapLayout = useMemo(() => {
    if (width === 0 || height === 0) return null;

    // Vytvoríme D3 hierarchiu
    const d3Root = hierarchy(hierarchyRoot)
      .sum((d) => d.value || 0) // Sčítame 'value' (marketCap)
      .sort((a, b) => (b.value || 0) - (a.value || 0)); // Zoradíme

    // Vytvoríme generátor treemapy
    // Použijeme funkciu .padding() pre presnú kontrolu medzier podľa depth hierarchie
    // depth 0 = ROOT → bez medzier
    // depth 1 = SEKTOR → medzera (SECTOR_GAP)
    // depth 2 = INDUSTRY → 0px
    // depth 3+ = FIRMY → 0px
    const SECTOR_GAP = LAYOUT_CONFIG.SECTOR_GAP;
    const treemapGenerator = treemap<HierarchyData>()
      .size([width, height])
      .padding(function (node) {
        if (node.depth === 1) {
          // Sektor → áno medzera
          return SECTOR_GAP;
        }
        // Industry + Firmy → 0px (žiadne medzery)
        return 0;
      })
      .paddingTop(0) // Žiadna rezerva hore - roztiahnuť hore
      .tile(treemapSquarify); // Algoritmus pre "štvorcovejší" layout

    // Spustíme výpočet layoutu
    treemapGenerator(d3Root);
    return d3Root;
  }, [
    hierarchyRoot,
    Math.floor(width / 10) * 10,  // Round to nearest 10px to prevent recalc on tiny resizes
    Math.floor(height / 10) * 10  // This improves performance during window resize
  ]);


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

  // Tile virtualization - filter out tiny tiles that are barely visible
  // This significantly reduces DOM nodes and improves rendering performance
  const MIN_VISIBLE_AREA = 500; // px² - tiles smaller than this won't render

  const allLeaves = useMemo(() => {
    const leaves = treemapLayout ? (treemapLayout.leaves() as TreemapLeaf[]) : [];

    // Filter out tiny tiles that are barely visible
    // These tiles are too small to show text anyway and just add rendering overhead
    const visibleLeaves = leaves.filter(leaf => {
      const area = (leaf.x1 - leaf.x0) * (leaf.y1 - leaf.y0);
      return area >= MIN_VISIBLE_AREA;
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 MarketHeatmap: Rendering ${visibleLeaves.length}/${leaves.length} companies (filtered ${leaves.length - visibleLeaves.length} tiny tiles < ${MIN_VISIBLE_AREA}px²)`);
    }
    return visibleLeaves;
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

    // Vypočítame skálu, aby sa mapa zmestila s okrajom (zmenšená mapa)
    const scaleX = (width * LAYOUT_CONFIG.SCALE_MARGIN) / treemapBounds.treemapWidth;
    const scaleY = (height * LAYOUT_CONFIG.SCALE_MARGIN) / treemapBounds.treemapHeight;
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

  // Progressive loading state
  const [visibleCount, setVisibleCount] = useState(50); // Start with 50 items
  const [renderMode, setRenderMode] = useState<'dom' | 'canvas'>('canvas'); // Default to Canvas

  // Reset visible count when data changes or zoom changes
  useEffect(() => {
    setVisibleCount(50);
  }, [filteredLeaves]);

  // Progressive loading effect (only for DOM mode)
  useEffect(() => {
    if (renderMode === 'dom' && visibleCount < filteredLeaves.length) {
      const frame = requestAnimationFrame(() => {
        setVisibleCount(prev => Math.min(prev + 100, filteredLeaves.length));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [visibleCount, filteredLeaves.length, renderMode]);

  // 2. Renderujeme Listy (Firmy) - Progressive Loading
  const visibleLeaves = filteredLeaves.slice(0, visibleCount);

  // Handler pre hover z Canvasu
  const handleCanvasHover = useCallback((company: CompanyNode | null, x: number, y: number) => {
    setHoveredNode(company);
    if (company) {
      setMousePosition({ x, y });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black text-white overflow-hidden"
      style={{ overflow: 'hidden' }}
      onMouseMove={renderMode === 'dom' ? handleMouseMove : undefined}
    >
      {(width === 0 || height === 0) && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 z-50">
          Loading layout...
        </div>
      )}

      {/* Controls */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => setRenderMode(prev => prev === 'dom' ? 'canvas' : 'dom')}
          className="px-3 py-1 bg-slate-700 text-white text-xs font-medium rounded hover:bg-slate-600 transition-colors opacity-80 hover:opacity-100"
        >
          Mode: {renderMode === 'dom' ? 'DOM (Slow)' : 'Canvas (Fast)'}
        </button>
      </div>

      {/* Zoom back button */}
      {zoomedSector && (
        <button
          onClick={() => setZoomedSector(null)}
          className="absolute top-4 left-4 z-40 px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
        >
          ← Back to All Sectors
        </button>
      )}

      {renderMode === 'canvas' ? (
        <CanvasHeatmap
          leaves={filteredLeaves}
          width={width}
          height={height}
          scale={scale}
          offset={offset}
          onTileClick={(company: CompanyNode) => onTileClick && onTileClick(company)}
          onHover={handleCanvasHover}
          metric={metric}
          timeframe={timeframe}
        />
      ) : (
        <>
          {/* Sektory a Industry labely sú odstránené - pôsobili rušivo */}
          {/* Zachovávame iba hover overlay pre sektory (ak je potrebný) */}
          {filteredNodes
            .filter((node) => node.depth === 1) // Iba Sektory pre hover overlay
            .map((node) => {
              const { x0, y0, x1, y1 } = node as TreemapNode;
              const data = node.data as HierarchyData;
              const nodeWidth = x1 - x0;
              const nodeHeight = y1 - y0;
              const isHovered = hoveredSector === data.name;

              return (
                <div
                  key={`sector-hover-${data.name}-${x0}-${y0}`}
                  className="absolute overflow-hidden cursor-pointer"
                  style={{
                    left: x0 * scale + offset.x,
                    top: y0 * scale + offset.y,
                    width: nodeWidth * scale,
                    height: nodeHeight * scale,
                    pointerEvents: 'auto',
                  }}
                  onMouseEnter={() => setHoveredSector(data.name)}
                  onMouseLeave={() => setHoveredSector(null)}
                  onClick={() => handleSectorClick(data.name)}
                >
                  {/* Hover overlay pre sektor */}
                  {isHovered && (
                    <div className="absolute inset-0 bg-blue-500 opacity-10 pointer-events-none" />
                  )}
                </div>
              );
            })}

          {/* 2. Renderujeme Listy (Firmy) */}
          {visibleLeaves.map((leaf) => {
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
                className="absolute flex flex-col items-center justify-center box-border transition-all duration-300 ease-out cursor-pointer group"
                style={{
                  left: x0 * scale + offset.x,
                  top: y0 * scale + offset.y,
                  width: tileWidth * scale,
                  height: tileHeight * scale,
                  backgroundColor: tileColor,
                  border: '1px solid rgba(0, 0, 0, 0.3)', // Tenká čierna čiara na okraj každej plochy
                  transitionProperty: colorTransition ? 'background-color' : 'all',
                }}
                onMouseEnter={() => setHoveredNode(company)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => onTileClick && onTileClick(company)}
              >
                {/* Text v dlaždici - vždy vycentrovaný */}
                {(showSymbol || showPercent) && (
                  <div
                    className="relative z-10 flex flex-col w-full h-full items-center justify-center transition-opacity opacity-90 group-hover:opacity-100"
                  >
                    {showSymbol && (
                      <div
                        className="font-bold text-white leading-tight tracking-tight"
                        style={{
                          fontSize: symbolFontPx,
                          lineHeight: 1.05,
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          textRendering: 'optimizeLegibility',
                          textShadow: TEXT_SHADOW,
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
                          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                          textRendering: 'optimizeLegibility',
                          textShadow: TEXT_SHADOW,
                        }}
                      >
                        {metric === 'mcap'
                          ? formatMarketCapDiff(company.marketCapDiff)
                          : formatPercent(company.changePercent)}
                      </div>
                    )}
                  </div>
                )}
                {/* Jemné zosvetlenie pozadia pri hoveri */}
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-100" />
              </div>
            );
          })}
        </>
      )}

      {/* Legenda je teraz v page.tsx headeri */}

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
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return { ref, size };
}

