/**
 * Heatmap Treemap Component
 * Displays stocks as treemap grouped by sector
 * - Size = Market Cap
 * - Color = Price Change (%)
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { calculateSectorTreemap, getColorForChange, TreemapNode } from '@/lib/treemap';
import { SectionIcon } from './SectionIcon';

interface HeatmapStock {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number;
  percentChange: number;
  currentPrice: number;
  sharesOutstanding: number | null;
}

interface SectorGroup {
  sector: string;
  totalMarketCap: number;
  stocks: HeatmapStock[];
}

interface HeatmapData {
  sectors: SectorGroup[];
  totalMarketCap: number;
  stockCount: number;
  date: string;
  session: string;
}

interface HeatmapTreemapProps {
  session?: 'pre' | 'live' | 'after';
  width?: number;
  height?: number;
}

export function HeatmapTreemap({ 
  session = 'live',
  width = 1200,
  height = 800
}: HeatmapTreemapProps) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<TreemapNode | null>(null);

  // Fetch heatmap data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/heatmap/treemap?session=${session}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
          setData(result.data);
        } else {
          throw new Error(result.error || 'Failed to fetch heatmap data');
        }
      } catch (err) {
        console.error('Error fetching heatmap data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Refresh every 60 seconds for live session
    if (session === 'live') {
      const interval = setInterval(fetchData, 60000);
      return () => clearInterval(interval);
    }
  }, [session]);

  // Calculate treemap layout
  const treemapLayout = useMemo(() => {
    if (!data || !data.sectors.length) return null;
    
    return calculateSectorTreemap(data.sectors, width, height);
  }, [data, width, height]);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-subtext)' }}>
        Loading heatmap...
      </div>
    );
  }

  if (error) {
    return (
      <div className="error" style={{ padding: '2rem', textAlign: 'center' }}>
        <strong>Error loading heatmap:</strong> {error}
      </div>
    );
  }

  if (!data || !treemapLayout) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--clr-subtext)' }}>
        No heatmap data available
      </div>
    );
  }

  return (
    <div className="heatmap-container" style={{ width: '100%', padding: '1rem' }}>
      <div className="heatmap-header" style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <SectionIcon type="globe" size={20} className="section-icon" />
          Market Heatmap
        </h3>
        <div style={{ fontSize: '0.875rem', color: 'var(--clr-subtext)', marginTop: '0.25rem' }}>
          {data.stockCount} stocks • Total Market Cap: ${data.totalMarketCap.toFixed(2)}B
        </div>
      </div>

      <div className="heatmap-legend" style={{ 
        display: 'flex', 
        gap: '1rem', 
        marginBottom: '1rem',
        fontSize: '0.875rem',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: 'rgb(0, 255, 0)', border: '1px solid var(--clr-border)' }}></div>
          <span>Positive</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: 'rgb(128, 128, 128)', border: '1px solid var(--clr-border)' }}></div>
          <span>Neutral</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '20px', backgroundColor: 'rgb(255, 0, 0)', border: '1px solid var(--clr-border)' }}></div>
          <span>Negative</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--clr-subtext)' }}>
          Size = Market Cap
        </div>
      </div>

      <svg 
        width={width} 
        height={height} 
        viewBox={`0 0 ${width} ${height}`}
        style={{ 
          border: '1px solid var(--clr-border)', 
          borderRadius: '8px',
          backgroundColor: 'var(--clr-surface)'
        }}
      >
        {treemapLayout.map((sectorTreemap, sectorIndex) => (
          <g key={sectorTreemap.sector}>
            {/* Sector label background */}
            <rect
              x={sectorTreemap.x}
              y={sectorTreemap.y}
              width={sectorTreemap.width}
              height={20}
              fill="var(--clr-bg)"
              opacity={0.9}
            />
            <text
              x={sectorTreemap.x + 5}
              y={sectorTreemap.y + 15}
              fontSize="12"
              fontWeight="600"
              fill="var(--clr-text)"
            >
              {sectorTreemap.sector}
            </text>
            
            {/* Stock blocks */}
            {sectorTreemap.nodes.map((node, nodeIndex) => {
              const stock = node.data as HeatmapStock;
              const color = getColorForChange(stock.percentChange);
              const isHovered = hoveredNode === node;
              
              return (
                <g key={`${stock.ticker}-${nodeIndex}`}>
                  <rect
                    x={node.x}
                    y={node.y + 20} // Offset for sector label
                    width={node.width}
                    height={node.height}
                    fill={color}
                    stroke={isHovered ? 'var(--clr-primary)' : 'var(--clr-border)'}
                    strokeWidth={isHovered ? 2 : 1}
                    opacity={isHovered ? 0.9 : 0.8}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ cursor: 'pointer' }}
                  />
                  
                  {/* Stock label (only if block is large enough) */}
                  {node.width > 60 && node.height > 30 && (
                    <text
                      x={node.x + node.width / 2}
                      y={node.y + 20 + node.height / 2}
                      fontSize="11"
                      fontWeight="600"
                      fill="white"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ 
                        textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                        pointerEvents: 'none'
                      }}
                    >
                      {stock.ticker}
                    </text>
                  )}
                  
                  {/* Percent change label */}
                  {node.width > 80 && node.height > 40 && (
                    <text
                      x={node.x + node.width / 2}
                      y={node.y + 20 + node.height / 2 + 15}
                      fontSize="10"
                      fill="white"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ 
                        textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                        pointerEvents: 'none'
                      }}
                    >
                      {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange.toFixed(2)}%
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredNode.x + 20}px`,
            top: `${hoveredNode.y + 20}px`,
            backgroundColor: 'var(--clr-surface)',
            border: '1px solid var(--clr-border)',
            borderRadius: '8px',
            padding: '0.75rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            pointerEvents: 'none',
            minWidth: '200px'
          }}
        >
          {(() => {
            const stock = hoveredNode.data as HeatmapStock;
            return (
              <>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
                  {stock.ticker} - {stock.name || 'N/A'}
                </div>
                <div style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>
                  <div><strong>Sector:</strong> {stock.sector || 'N/A'}</div>
                  <div><strong>Industry:</strong> {stock.industry || 'N/A'}</div>
                  <div><strong>Price:</strong> ${stock.currentPrice.toFixed(2)}</div>
                  <div style={{ color: stock.percentChange >= 0 ? '#16a34a' : '#dc2626' }}>
                    <strong>Change:</strong> {stock.percentChange >= 0 ? '+' : ''}{stock.percentChange.toFixed(2)}%
                  </div>
                  <div><strong>Market Cap:</strong> ${stock.marketCap.toFixed(2)}B</div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

