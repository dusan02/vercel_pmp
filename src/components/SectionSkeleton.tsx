'use client';

import React from 'react';

interface SectionSkeletonProps {
  rows?: number;
  showHeader?: boolean;
}

export function SectionSkeleton({ rows = 5, showHeader = true }: SectionSkeletonProps) {
  return (
    <div className="section-skeleton">
      {showHeader && (
        <div className="section-skeleton-header">
          <div className="section-skeleton-title" />
        </div>
      )}
      <div className="section-skeleton-content">
        <div className="section-skeleton-table">
          <div className="section-skeleton-row section-skeleton-header-row">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="section-skeleton-cell section-skeleton-header-cell" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="section-skeleton-row">
              {Array.from({ length: 8 }).map((_, cellIndex) => (
                <div key={cellIndex} className="section-skeleton-cell" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeatmapSkeleton() {
  return (
    <div className="heatmap-skeleton">
      <div className="heatmap-skeleton-header">
        <div className="heatmap-skeleton-title" />
        <div className="heatmap-skeleton-controls">
          <div className="heatmap-skeleton-button" />
          <div className="heatmap-skeleton-button" />
        </div>
      </div>
      <div className="heatmap-skeleton-content">
        <div className="heatmap-skeleton-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="heatmap-skeleton-tile" />
          ))}
        </div>
      </div>
    </div>
  );
}

