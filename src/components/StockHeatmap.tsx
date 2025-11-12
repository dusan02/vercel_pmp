"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
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
  maxContainerWidth: 1200, // Similar to Finviz max-width: 1199px
  sectorLabelHeight: 24,
  minCellArea: 9000,
  minCellSize: 38,
  largeCellArea: 12000,
  sidebarWidth: 200 // Sidebar width similar to Finviz (w-50 = 200px)
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

interface LegendProps {
  position?: 'top' | 'bottom'
}

const Legend: React.FC<LegendProps> = ({ position = 'top' }) => (
  <div style={{ 
    display: 'flex', 
    justifyContent: position === 'bottom' ? 'space-between' : 'flex-end',
    alignItems: 'center',
    gap: '2px',
    fontSize: '0.75rem',
    marginTop: position === 'bottom' ? '1rem' : '0',
    marginBottom: position === 'top' ? '1rem' : '0',
    paddingTop: position === 'bottom' ? '1rem' : '0',
    flexWrap: 'wrap'
  }}>
    <div style={{ 
      display: 'flex', 
      gap: '2px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.negative.strong,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        -3%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.negative.high,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        -2%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.negative.medium,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        -1%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.neutral,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        0%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.positive.medium,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        +1%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.positive.high,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        +2%
      </div>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '0 8px',
        height: '24px',
        minWidth: '50px',
        backgroundColor: COLOR_SCALE.positive.strong,
        color: 'white',
        fontSize: '0.75rem',
        fontWeight: 'normal',
        textShadow: 'rgba(0, 0, 0, 0.25) 0px 1px 0px'
      }}>
        +3%
      </div>
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

interface IndustryLabelProps {
  industry: string
  x: number
  y: number
  width: number
}

const IndustryLabel: React.FC<IndustryLabelProps> = ({ industry, x, y, width }) => (
  <div
    style={{
      position: 'absolute',
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: '20px',
      display: 'flex',
      alignItems: 'center',
      paddingLeft: '0.5rem',
      fontSize: '0.5rem',
      fontWeight: '500',
      letterSpacing: '0.02em',
      textTransform: 'uppercase',
      color: 'var(--clr-subtext)',
      backgroundColor: 'rgba(0,0,0,0.05)',
      borderBottom: '1px solid var(--clr-border)',
      zIndex: 15
    }}
  >
    {industry}
  </div>
)

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
        top: `${Math.round(node.y)}px`,
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
  refreshInterval = 180000, // 3 minutes default (reduced from 60s to avoid rate limits)
}: StockHeatmapProps = {}) {
  const [hoveredStock, setHoveredStock] = useState<string | null>(null)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [activeSector, setActiveSector] = useState<string | null>(null)
  const [isRateLimited, setIsRateLimited] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSector, setSelectedSector] = useState<string | null>(null)
  
  const mainContainerRef = useRef<HTMLDivElement>(null)
  const treemapSectionRef = useRef<HTMLElement>(null)
  const innerContainerRef = useRef<HTMLDivElement>(null)
  const fetchAbortControllerRef = useRef<AbortController | null>(null)

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = async (retryCount = 0, maxRetries = 2) => {
    // Cancel previous request if still pending
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort()
    }
    
    const abortController = new AbortController()
    fetchAbortControllerRef.current = abortController
    
    try {
      setLoading(true)
      setError(null)
      setIsRateLimited(false)
      
      const response = await fetch(`/api/heatmap/treemap`, {
        signal: abortController.signal,
        cache: 'no-store'
      })
      
      if (!response.ok) {
        // Handle rate limit (429)
        if (response.status === 429) {
          setIsRateLimited(true)
          const retryAfter = response.headers.get('Retry-After')
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000 // Default 60s
          
          if (retryCount < maxRetries) {
            console.log(`⏳ Rate limited (429), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`)
            await new Promise(resolve => setTimeout(resolve, delay))
            return fetchData(retryCount + 1, maxRetries)
          } else {
            throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(delay / 1000)} seconds before refreshing.`)
          }
        }
        
        const errorText = await response.text()
        console.error(`API error ${response.status}:`, errorText)
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (result.success && result.data) {
        // Check if we have any sectors with stocks
        if (result.data.sectors && result.data.sectors.length > 0) {
          const totalStocks = result.data.sectors.reduce((sum: number, sector: SectorGroup) => sum + sector.stocks.length, 0)
          if (totalStocks > 0) {
            setData(result.data)
            setIsRateLimited(false)
          } else {
            throw new Error("No stocks found in sectors")
          }
        } else {
          throw new Error("No sectors found in response")
        }
      } else {
        throw new Error(result.error || "Invalid API response")
      }
    } catch (err) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return
      }
      
      const errorMessage = err instanceof Error ? err.message : "Failed to load data"
      setError(errorMessage)
      console.error("Error fetching heatmap data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchData()
      }, refreshInterval)
      
      return () => {
        clearInterval(interval)
        // Cancel any pending request on unmount
        if (fetchAbortControllerRef.current) {
          fetchAbortControllerRef.current.abort()
        }
      }
    }
  }, [autoRefresh, refreshInterval])

  // ============================================================================
  // Layout Calculation
  // ============================================================================

  useEffect(() => {
    const updateWidth = () => {
      // Calculate available width from main container (accounting for sidebar)
      if (mainContainerRef.current && innerContainerRef.current) {
        const containerElement = mainContainerRef.current
        const sidebarWidth = LAYOUT_CONFIG.sidebarWidth
        const padding = 32 // 1rem padding on each side
        const availableWidth = containerElement.offsetWidth - sidebarWidth - padding
        
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

  // ============================================================================
  // Data Filtering
  // ============================================================================

  // Get unique sectors for sidebar filter
  const allSectors = useMemo(() => {
    if (!data) return []
    return Array.from(new Set(data.sectors.map(s => s.sector))).sort()
  }, [data])

  // Filter stocks by search term and selected sector
  // Initialize with null to ensure it's always defined
  const filteredData: HeatmapData | null = useMemo(() => {
    if (!data) return null
    if (!searchTerm && !selectedSector) return data

    const filteredSectors = data.sectors
      .filter(sector => !selectedSector || sector.sector === selectedSector)
      .map(sector => ({
        ...sector,
        stocks: sector.stocks.filter(stock => 
          !searchTerm || 
          stock.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (stock.name && stock.name.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      }))
      .filter(sector => sector.stocks.length > 0) // Remove empty sectors

    // Recalculate total market cap for filtered data
    const totalMarketCap = filteredSectors.reduce((sum, sector) => 
      sum + sector.stocks.reduce((sectorSum, stock) => sectorSum + stock.marketCap, 0), 
      0
    )

    const stockCount = filteredSectors.reduce((sum, sector) => sum + sector.stocks.length, 0)

    return {
      sectors: filteredSectors,
      totalMarketCap,
      stockCount,
      date: data.date
    }
  }, [data, searchTerm, selectedSector])

  const sectorsForLayout = useMemo(() => {
    if (!filteredData) return []
    if (!activeSector) return filteredData.sectors
    return filteredData.sectors.filter(s => s.sector === activeSector)
  }, [filteredData, activeSector])

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
          <div style={{ fontSize: '3rem' }}>{isRateLimited ? '⏳' : '⚠️'}</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '1rem' }}>
            {isRateLimited ? 'Rate Limit Exceeded' : 'Error Loading Data'}
          </h3>
          <p style={{ color: 'var(--clr-subtext)', marginTop: '1rem' }}>{error}</p>
          {isRateLimited && (
            <p style={{ color: 'var(--clr-subtext)', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              Auto-refresh is paused. The page will automatically retry in a few minutes.
            </p>
          )}
          <button
            onClick={() => {
              setIsRateLimited(false)
              fetchData()
            }}
            disabled={isRateLimited}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              backgroundColor: isRateLimited ? 'var(--clr-border)' : 'var(--clr-primary)',
              color: isRateLimited ? 'var(--clr-subtext)' : 'var(--clr-bg)',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: isRateLimited ? 'not-allowed' : 'pointer',
              opacity: isRateLimited ? 0.6 : 1
            }}
          >
            {isRateLimited ? 'Please Wait...' : 'Try Again'}
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
        display: 'flex',
        flexDirection: 'column',
        minHeight: '600px'
      }}
    >
      {/* Header */}
      <div style={{
        backgroundColor: '#363a46',
        color: '#94a3b8',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid #444a57',
        marginBottom: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: '0.75rem', 
            textTransform: 'uppercase', 
            opacity: 0.5,
            fontWeight: 'normal'
          }}>
            View
          </h2>
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem',
            fontSize: '0.75rem',
            color: 'white',
            fontWeight: '600'
          }}>
            <span>Market Heatmap</span>
          </div>
          <div style={{ 
            marginLeft: 'auto',
            fontSize: '0.75rem',
            color: '#94a3b8'
          }}>
            {data ? (
              filteredData ? (
                `${filteredData.stockCount || 0} stocks • $${(filteredData.totalMarketCap || 0).toFixed(2)}B total market cap`
              ) : (
                `${data.stockCount || 0} stocks • $${(data.totalMarketCap || 0).toFixed(2)}B total market cap`
              )
            ) : (
              '0 stocks • $0.00B total market cap'
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Sidebar + Map */}
      <div style={{
        display: 'flex',
        width: '100%',
        gap: '0.5rem'
      }}>
        {/* Sidebar - Similar to Finviz */}
        <div style={{
          width: `${LAYOUT_CONFIG.sidebarWidth}px`,
          minWidth: `${LAYOUT_CONFIG.sidebarWidth}px`,
          backgroundColor: '#363a46',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #444a57'
        }}>
          {/* Search */}
          <div style={{
            padding: '0.75rem',
            borderBottom: '1px solid #444a57'
          }}>
            <input
              type="text"
              placeholder="Quick search ticker"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: 'transparent',
                border: '1px solid #585f72',
                borderRadius: '0.25rem',
                color: '#94a3b8',
                fontSize: '0.75rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Sector Filter */}
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #444a57'
          }}>
            <h3 style={{
              margin: '0 0 0.75rem 0',
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              color: '#94a3b8',
              opacity: 0.5,
              fontWeight: 'normal'
            }}>
              Sectors
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              maxHeight: '400px',
              overflowY: 'auto'
            }}>
              <button
                onClick={() => setSelectedSector(null)}
                style={{
                  padding: '0.5rem',
                  textAlign: 'left',
                  backgroundColor: selectedSector === null ? '#4a505f' : 'transparent',
                  border: 'none',
                  color: selectedSector === null ? 'white' : '#94a3b8',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  borderRadius: '0.25rem'
                }}
              >
                All Sectors
              </button>
              {allSectors.map(sector => (
                <button
                  key={sector}
                  onClick={() => setSelectedSector(sector)}
                  style={{
                    padding: '0.5rem',
                    textAlign: 'left',
                    backgroundColor: selectedSector === sector ? '#4a505f' : 'transparent',
                    border: 'none',
                    color: selectedSector === sector ? 'white' : '#94a3b8',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    borderRadius: '0.25rem'
                  }}
                >
                  {sector}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map Area */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingLeft: '1rem',
          paddingTop: '0.25rem'
        }}>
          {activeSector && (
            <BackButton 
              activeSector={activeSector}
              onBack={() => setActiveSector(null)}
            />
          )}

          {treemapLayout && (
            <div style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Legend at top */}
              <Legend position="top" />

              {/* Map Canvas */}
              <div
                ref={innerContainerRef}
                style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: `${LAYOUT_CONFIG.maxContainerWidth}px`,
                  margin: '0 auto'
                }}
              >
                <div style={{ 
                  position: 'relative', 
                  width: '100%',
                  height: `${LAYOUT_CONFIG.containerHeight}px`,
                  border: '1px solid #444a57',
                  borderRadius: '0.25rem',
                  overflow: 'visible',
                  backgroundColor: '#404553',
                  margin: '0 auto'
                }}>
                  {treemapLayout.sectors.map((sectorLayout) => (
                    <React.Fragment key={sectorLayout.sector}>
                      <SectorLabel
                        sector={sectorLayout.sector}
                        x={sectorLayout.x}
                        width={sectorLayout.width}
                        onClick={() => setActiveSector(sectorLayout.sector)}
                      />
                      {sectorLayout.industries?.map((industryLayout) => (
                        <IndustryLabel
                          key={`${sectorLayout.sector}-${industryLayout.industry}`}
                          industry={industryLayout.industry}
                          x={industryLayout.x}
                          y={industryLayout.y}
                          width={industryLayout.width}
                        />
                      ))}
                    </React.Fragment>
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

              {/* Legend at bottom */}
              <Legend position="bottom" />

              {/* Info text */}
              <div style={{
                marginTop: '1rem',
                fontSize: '0.75rem',
                color: '#94a3b8',
                paddingBottom: '1rem'
              }}>
                Use mouse to hover over stocks. Click on sector labels to zoom in.
                <br />
                Size represents market capitalization.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
