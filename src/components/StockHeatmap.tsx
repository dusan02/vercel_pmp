"use client"

import React, { useState, useEffect, useMemo } from "react"
import { calculateUnifiedTreemap } from "@/lib/unifiedTreemap"

// ============================================================================
// Types
// ============================================================================

interface HeatmapStock {
  ticker: string
  name: string | null
  sector: string | null
  industry: string | null
  marketCap: number
  percentChange: number
  currentPrice: number
  sharesOutstanding?: number | null
}

interface SectorGroup {
  sector: string
  totalMarketCap: number
  stocks: HeatmapStock[]
}

interface HeatmapData {
  sectors: SectorGroup[]
  totalMarketCap: number
  stockCount: number
  date: string
}

interface StockHeatmapProps {
  autoRefresh?: boolean
  refreshInterval?: number
}

// ============================================================================
// Constants
// ============================================================================

const COLOR_SCALE = {
  positive: {
    strong: "rgb(48,204,90)",   // >= 3%
    high: "rgb(47,158,79)",      // >= 2%
    medium: "rgb(53,118,78)",    // >= 1%
    low: "rgb(55,100,75)",       // >= 0.5%
    minimal: "rgb(58,85,80)"     // > 0%
  },
  neutral: "rgb(65,69,84)",      // 0% or -0.1% to 0.1%
  negative: {
    minimal: "rgb(85,68,78)",    // > -0.5%
    low: "rgb(105,68,78)",       // > -1%
    medium: "rgb(139,68,78)",   // > -2%
    high: "rgb(191,64,69)",      // > -3%
    strong: "rgb(246,53,56)"     // <= -3%
  }
} as const

const LAYOUT_CONFIG = {
  containerHeight: 800,
  minContainerWidth: 1000,
  maxContainerWidth: 1800,
  sectorLabelHeight: 24,
  minCellArea: 9000,
  minCellSize: 38,
  largeCellArea: 12000
} as const

// ============================================================================
// Utility Functions
// ============================================================================

const getColor = (change: number): string => {
  if (change >= 3) return COLOR_SCALE.positive.strong
  if (change >= 2) return COLOR_SCALE.positive.high
  if (change >= 1) return COLOR_SCALE.positive.medium
  if (change >= 0.5) return COLOR_SCALE.positive.low
  if (change > 0) return COLOR_SCALE.positive.minimal
  if (change === 0 || (change > -0.1 && change < 0.1)) return COLOR_SCALE.neutral
  if (change > -0.5) return COLOR_SCALE.negative.minimal
  if (change > -1) return COLOR_SCALE.negative.low
  if (change > -2) return COLOR_SCALE.negative.medium
  if (change > -3) return COLOR_SCALE.negative.high
  return COLOR_SCALE.negative.strong
}

const formatPercentChange = (change: number): string => {
  return `${change > 0 ? "+" : ""}${change.toFixed(2)}%`
}

// ============================================================================
// Sub-components
// ============================================================================

interface HeaderProps {
  stockCount: number
  totalMarketCap: number
  date: string
}

const Header: React.FC<HeaderProps> = ({ stockCount, totalMarketCap, date }) => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column',
    gap: '1rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--clr-border)',
    marginBottom: '1rem'
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: '700' }}>Market Heatmap</h1>
      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--clr-subtext)' }}>
        <span>{stockCount} stocks</span>
        <span>${totalMarketCap.toFixed(2)}B total market cap</span>
        <span>{new Date(date).toLocaleDateString()}</span>
      </div>
    </div>
  </div>
)

const Legend: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    flexWrap: 'wrap', 
    gap: '1rem', 
    fontSize: '0.75rem', 
    color: 'var(--clr-subtext)', 
    marginBottom: '1rem' 
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '16px', height: '16px', backgroundColor: COLOR_SCALE.positive.strong, borderRadius: '4px' }}></div>
      <span>Positive change</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '16px', height: '16px', backgroundColor: COLOR_SCALE.negative.strong, borderRadius: '4px' }}></div>
      <span>Negative change</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: '16px', height: '16px', backgroundColor: COLOR_SCALE.neutral, borderRadius: '4px' }}></div>
      <span>No change</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span>Size = Market Cap</span>
    </div>
  </div>
)

interface BackButtonProps {
  activeSector: string
  onBack: () => void
}

const BackButton: React.FC<BackButtonProps> = ({ activeSector, onBack }) => (
  <div style={{ 
    display: 'flex', 
    alignItems: 'center', 
    marginBottom: '1rem'
  }}>
    <button
      onClick={onBack}
      style={{
        padding: '0.375rem 0.75rem',
        fontSize: '0.875rem',
        borderRadius: '0.25rem',
        border: '1px solid var(--clr-border)',
        backgroundColor: 'var(--clr-primary)',
        color: 'var(--clr-bg)',
        cursor: 'pointer'
      }}
    >
      ← Späť ({activeSector})
    </button>
  </div>
)

interface SectorLabelProps {
  sector: string
  x: number
  width: number
  onClick: () => void
}

const SectorLabel: React.FC<SectorLabelProps> = ({ sector, x, width, onClick }) => {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: '0',
        width: `${width}px`,
        height: `${LAYOUT_CONFIG.sectorLabelHeight}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.625rem',
        fontWeight: '600',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: 'var(--clr-subtext)',
        backgroundColor: isHovered ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)',
        borderRight: '1px solid var(--clr-border)',
        cursor: 'pointer',
        zIndex: 20,
        transition: 'background-color 0.2s'
      }}
    >
      {sector}
    </div>
  )
}

interface StockTooltipProps {
  stock: HeatmapStock
  isOther?: boolean
  position: 'top' | 'bottom'
}

const StockTooltip: React.FC<StockTooltipProps> = ({ stock, isOther, position }) => (
  <div style={{
    position: 'absolute',
    top: position === 'bottom' ? '100%' : 'auto',
    bottom: position === 'top' ? '100%' : 'auto',
    left: '50%',
    transform: 'translateX(-50%)',
    marginTop: position === 'bottom' ? '0.5rem' : '0',
    marginBottom: position === 'top' ? '0.5rem' : '0',
    padding: '0.5rem',
    backgroundColor: 'rgba(0,0,0,0.9)',
    color: 'white',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap',
    zIndex: 100,
    pointerEvents: 'none'
  }}>
    <div style={{ fontWeight: '700' }}>{stock.ticker}</div>
    {stock.name && <div>{stock.name}</div>}
    <div>{formatPercentChange(stock.percentChange)}</div>
    <div>${stock.marketCap.toFixed(1)}B</div>
    {stock.industry && <div style={{ fontSize: '10px' }}>{stock.industry}</div>}
  </div>
)

interface StockBlockProps {
  node: {
    x: number
    y: number
    width: number
    height: number
    data: HeatmapStock
    sector?: string
    isOther?: boolean
    otherCount?: number
  }
  isHovered: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
}

const StockBlock: React.FC<StockBlockProps> = ({ node, isHovered, onMouseEnter, onMouseLeave }) => {
  const stock = node.data
  const bgColor = getColor(stock.percentChange)
  const cellArea = node.width * node.height
  const minDimension = Math.min(node.width, node.height)
  const shouldShowLabel = cellArea > LAYOUT_CONFIG.minCellArea && minDimension > LAYOUT_CONFIG.minCellSize && !node.isOther
  const shouldShowPercent = cellArea > LAYOUT_CONFIG.largeCellArea

  return (
    <button
      style={{
        position: 'absolute',
        left: `${Math.round(node.x)}px`,
        top: `${Math.round(node.y + LAYOUT_CONFIG.sectorLabelHeight)}px`,
        width: `${Math.round(node.width)}px`,
        height: `${Math.round(node.height)}px`,
        backgroundColor: bgColor,
        border: isHovered ? '2px solid var(--clr-primary)' : '1px solid rgba(0,0,0,0.2)',
        transition: 'border 0.2s',
        zIndex: isHovered ? 10 : 1,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.25rem',
        padding: '0.5rem'
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid var(--clr-primary)'
        e.currentTarget.style.transform = 'scale(1.02)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none'
        e.currentTarget.style.transform = 'scale(1)'
      }}
    >
      {shouldShowLabel && (
        <>
          <span style={{
            fontWeight: '700',
            fontSize: isHovered ? '1.125rem' : '1rem',
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: 'white',
            textAlign: 'center'
          }}>
            {stock.ticker}
          </span>
          {shouldShowPercent && (
            <span style={{
              fontWeight: isHovered ? '700' : '600',
              fontSize: isHovered ? '1rem' : '0.875rem',
              fontFamily: 'monospace',
              lineHeight: 1,
              color: 'rgba(255,255,255,0.95)'
            }}>
              {formatPercentChange(stock.percentChange)}
            </span>
          )}
          {isHovered && (
            <div style={{
              fontSize: '0.75rem',
              fontWeight: '500',
              color: 'rgba(255,255,255,0.8)',
              textAlign: 'center',
              marginTop: '0.25rem'
            }}>
              {stock.name && <div style={{ fontWeight: '600' }}>{stock.name}</div>}
              <div>${stock.marketCap.toFixed(1)}B</div>
              <div>${stock.currentPrice.toFixed(2)}</div>
              {stock.industry && <div style={{ fontSize: '10px' }}>{stock.industry}</div>}
            </div>
          )}
        </>
      )}
      
      {node.isOther && stock.ticker === 'OTHER' && (
        <div style={{
          fontSize: '0.625rem',
          fontWeight: '600',
          color: 'rgba(255,255,255,0.9)',
          textAlign: 'center',
          padding: '0.25rem'
        }}>
          +{node.otherCount || 0} smaller
        </div>
      )}
      
      {(!shouldShowLabel || node.isOther) && isHovered && (
        <StockTooltip 
          stock={stock} 
          isOther={node.isOther}
          position={node.isOther ? 'top' : 'bottom'}
        />
      )}
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export default function StockHeatmap({
  autoRefresh = true,
  refreshInterval = 60000,
}: StockHeatmapProps = {}) {
  const [hoveredStock, setHoveredStock] = useState<string | null>(null)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [activeSector, setActiveSector] = useState<string | null>(null)
  
  const mainContainerRef = React.useRef<HTMLDivElement>(null)
  const treemapSectionRef = React.useRef<HTMLElement>(null)
  const innerContainerRef = React.useRef<HTMLDivElement>(null)

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`/api/heatmap/treemap`)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error(result.error || "Invalid API response")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data")
      console.error("Error fetching heatmap data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    if (autoRefresh) {
      const interval = setInterval(fetchData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshInterval])

  // ============================================================================
  // Layout Calculation
  // ============================================================================

  useEffect(() => {
    const updateWidth = () => {
      // Calculate available width from main container (accounting for padding)
      if (mainContainerRef.current) {
        const containerElement = mainContainerRef.current
        const computedStyle = window.getComputedStyle(containerElement)
        const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0
        const paddingRight = parseFloat(computedStyle.paddingRight) || 0
        const availableWidth = containerElement.offsetWidth - paddingLeft - paddingRight
        
        const calculatedWidth = Math.min(
          Math.max(availableWidth, LAYOUT_CONFIG.minContainerWidth), 
          LAYOUT_CONFIG.maxContainerWidth
        )
        setContainerWidth(calculatedWidth)
      }
    }
    // Initial calculation with small delay to ensure DOM is ready
    const timeoutId = setTimeout(updateWidth, 100)
    // Recalculate on resize
    window.addEventListener('resize', updateWidth)
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('resize', updateWidth)
    }
  }, [data]) // Recalculate when data changes

  const sectorsForLayout = useMemo(() => {
    if (!data) return []
    if (!activeSector) return data.sectors
    return data.sectors.filter(s => s.sector === activeSector)
  }, [data, activeSector])

  const layoutOpts = useMemo(() => ({
    alpha: 1,
    minSectorWidthPx: 100,
    maxSectorFrac: 0.6
  }), [containerWidth, sectorsForLayout.length])

  const treemapLayout = useMemo(() => {
    if (!sectorsForLayout || !sectorsForLayout.length) return null
    return calculateUnifiedTreemap(
      sectorsForLayout, 
      containerWidth, 
      LAYOUT_CONFIG.containerHeight, 
      layoutOpts
    )
  }, [sectorsForLayout, containerWidth, layoutOpts])

  // ============================================================================
  // Render States
  // ============================================================================

  if (loading && !data) {
    return (
      <div style={{ 
        width: '100%', 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            animation: 'spin 1s linear infinite',
            borderRadius: '50%',
            height: '48px',
            width: '48px',
            border: '2px solid var(--clr-border)',
            borderTopColor: 'var(--clr-primary)',
            margin: '0 auto'
          }}></div>
          <p style={{ marginTop: '1rem', color: 'var(--clr-subtext)' }}>Loading market data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        width: '100%', 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '1rem' }}>Error Loading Data</h3>
          <p style={{ color: 'var(--clr-subtext)', marginTop: '1rem' }}>{error}</p>
          <button
            onClick={fetchData}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--clr-primary)',
              color: 'var(--clr-bg)',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!data || data.sectors.length === 0) {
    return (
      <div style={{ 
        width: '100%', 
        height: '600px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.25rem', color: 'var(--clr-subtext)' }}>No data available</p>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Main Render
  // ============================================================================

  return (
    <div 
      ref={mainContainerRef}
      style={{ 
        width: '100%', 
        maxWidth: '1800px', 
        margin: '0 auto',
        padding: '0 1rem'
      }}
    >
      <Header 
        stockCount={data.stockCount}
        totalMarketCap={data.totalMarketCap}
        date={data.date}
      />
      
      <Legend />
      
      {activeSector && (
        <BackButton 
          activeSector={activeSector}
          onBack={() => setActiveSector(null)}
        />
      )}

      {treemapLayout && (
        <section
          ref={treemapSectionRef}
          style={{
            position: 'relative',
            width: '100%',
            marginBottom: '1rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start'
          }}
        >
          <div
            ref={innerContainerRef}
            style={{
              position: 'relative',
              width: `${containerWidth}px`,
              maxWidth: '100%'
            }}
          >
            <div style={{ 
              position: 'relative', 
              width: `${containerWidth}px`,
              height: `${LAYOUT_CONFIG.containerHeight}px`,
              border: '1px solid var(--clr-border)',
              borderRadius: '0.5rem',
              overflow: 'visible',
              backgroundColor: 'var(--clr-surface)',
              margin: '0 auto',
              isolation: 'isolate'
            }}>
              {treemapLayout.sectors.map((sectorLayout) => (
                <SectorLabel
                  key={sectorLayout.sector}
                  sector={sectorLayout.sector}
                  x={sectorLayout.x}
                  width={sectorLayout.width}
                  onClick={() => setActiveSector(sectorLayout.sector)}
                />
              ))}
              
              {treemapLayout.allNodes.map((node, nodeIndex) => {
                const stock = node.data as HeatmapStock
                const uniqueKey = `${node.sector || 'unknown'}-${stock.ticker}-${node.x}-${node.y}-${nodeIndex}`
                
                return (
                  <StockBlock
                    key={uniqueKey}
                    node={node}
                    isHovered={hoveredStock === stock.ticker}
                    onMouseEnter={() => setHoveredStock(stock.ticker)}
                    onMouseLeave={() => setHoveredStock(null)}
                  />
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
