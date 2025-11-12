'use client';

import React from 'react';

interface HeatmapIconProps {
  variant?: 'simple' | 'detailed' | 'grid' | 'minimal';
  size?: number;
  className?: string;
}

export const HeatmapIcon: React.FC<HeatmapIconProps> = ({ 
  variant = 'simple',
  size = 24,
  className = ''
}) => {
  const viewBox = `0 0 ${size} ${size}`;
  
  // Simple heatmap - 3x3 grid with color gradient
  const SimpleHeatmap = () => {
    const gridSize = 3;
    const cellSize = (size - 4) / gridSize;
    const spacing = 1;
    const colors = [
      '#22c55e', // Green (positive)
      '#eab308', // Yellow (neutral)
      '#ef4444', // Red (negative)
      '#3b82f6', // Blue (high)
      '#f97316', // Orange (medium-high)
      '#eab308', // Yellow (medium)
      '#ef4444', // Red (low)
      '#3b82f6', // Blue (high)
      '#22c55e', // Green (positive)
    ];
    
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const x = 2 + col * (cellSize + spacing);
          const y = 2 + row * (cellSize + spacing);
          
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              fill={colors[index]}
              rx={cellSize * 0.15}
            />
          );
        })}
      </svg>
    );
  };

  // Detailed heatmap - 4x4 grid with more colors
  const DetailedHeatmap = () => {
    const gridSize = 4;
    const cellSize = (size - 6) / gridSize;
    const spacing = 1;
    const colors = [
      '#22c55e', '#4ade80', '#eab308', '#f59e0b',
      '#86efac', '#22c55e', '#eab308', '#ef4444',
      '#3b82f6', '#60a5fa', '#eab308', '#f97316',
      '#1d4ed8', '#3b82f6', '#ef4444', '#dc2626',
    ];
    
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const x = 3 + col * (cellSize + spacing);
          const y = 3 + row * (cellSize + spacing);
          
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              fill={colors[index]}
              rx={cellSize * 0.2}
            />
          );
        })}
      </svg>
    );
  };

  // Grid heatmap - 5x5 grid with gradient pattern
  const GridHeatmap = () => {
    const gridSize = 5;
    const cellSize = (size - 8) / gridSize;
    const spacing = 1;
    
    // Create gradient pattern: green -> yellow -> red
    const getColor = (row: number, col: number) => {
      const distance = Math.sqrt(
        Math.pow(row - gridSize / 2, 2) + Math.pow(col - gridSize / 2, 2)
      );
      const maxDistance = Math.sqrt(
        Math.pow(gridSize / 2, 2) + Math.pow(gridSize / 2, 2)
      );
      const ratio = distance / maxDistance;
      
      if (ratio < 0.3) return '#22c55e'; // Green (center)
      if (ratio < 0.6) return '#eab308'; // Yellow (middle)
      return '#ef4444'; // Red (edges)
    };
    
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const x = 4 + col * (cellSize + spacing);
          const y = 4 + row * (cellSize + spacing);
          
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              fill={getColor(row, col)}
              rx={cellSize * 0.15}
            />
          );
        })}
      </svg>
    );
  };

  // Minimal heatmap - simple 2x2 grid
  const MinimalHeatmap = () => {
    const gridSize = 2;
    const cellSize = (size - 4) / gridSize;
    const spacing = 1;
    const colors = ['#22c55e', '#ef4444', '#3b82f6', '#eab308'];
    
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {Array.from({ length: gridSize * gridSize }).map((_, index) => {
          const row = Math.floor(index / gridSize);
          const col = index % gridSize;
          const x = 2 + col * (cellSize + spacing);
          const y = 2 + row * (cellSize + spacing);
          
          return (
            <rect
              key={index}
              x={x}
              y={y}
              width={cellSize}
              height={cellSize}
              fill={colors[index]}
              rx={cellSize * 0.2}
            />
          );
        })}
      </svg>
    );
  };

  switch (variant) {
    case 'detailed':
      return <DetailedHeatmap />;
    case 'grid':
      return <GridHeatmap />;
    case 'minimal':
      return <MinimalHeatmap />;
    case 'simple':
    default:
      return <SimpleHeatmap />;
  }
};

