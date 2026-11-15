'use client';

import React from 'react';
import {
  PORTFOLIO_DONUT_GEOMETRY,
  formatDonutTotal,
  getDonutViewBox,
  type DonutLabelLayout,
} from '@/lib/utils/portfolioDonutLayout';

interface PortfolioDonutCardProps {
  title: string;
  size?: number;
  isEmpty?: boolean;
  emptyInnerRatio?: number;
  children?: React.ReactNode;
}

/** Shared responsive card shell and SVG viewport for portfolio donut visualizations. */
export function PortfolioDonutCard({
  title,
  size = PORTFOLIO_DONUT_GEOMETRY.size,
  isEmpty = false,
  emptyInnerRatio = 0.6,
  children,
}: PortfolioDonutCardProps) {
  const { viewBoxWidth, viewBoxHeight, centerX, centerY, aspectRatio } = getDonutViewBox(size);
  const outerR = size / 2;
  const innerR = outerR * emptyInnerRatio;

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm xl:text-base font-semibold text-[var(--clr-subtext)] mb-3 uppercase tracking-wider">
        {title}
      </h3>
      <div className="flex-1 flex items-center justify-center">
        <div
          className={`relative w-full ${isEmpty ? 'opacity-30 grayscale' : ''}`}
          style={{ maxWidth: viewBoxWidth, aspectRatio }}
        >
          <svg
            viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="w-full h-full"
          >
            <g transform={`translate(${centerX}, ${centerY})`}>
              {isEmpty ? (
                <>
                  <circle r={outerR} fill="none" stroke="var(--clr-border)" strokeWidth="2" strokeDasharray="4 4" />
                  <circle r={innerR} fill="none" stroke="var(--clr-border)" strokeWidth="2" strokeDasharray="4 4" />
                  <text textAnchor="middle" dy="0.3em" className="fill-gray-400 text-sm font-medium">
                    No Data
                  </text>
                </>
              ) : (
                children
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

interface PortfolioDonutLabelsProps {
  labels: DonutLabelLayout[];
  totalValue: number;
}

/** Shared leader-line annotations and center Total readout for portfolio donut charts. */
export function PortfolioDonutLabels({ labels, totalValue }: PortfolioDonutLabelsProps) {
  return (
    <>
      {labels.map((lbl) => {
        const textAnchor = lbl.isRight ? 'start' : 'end';
        return (
          <g key={lbl.key} className="pointer-events-none">
            <polyline
              points={`${lbl.startX},${lbl.startY} ${lbl.elbowX},${lbl.elbowY} ${lbl.endX},${lbl.elbowY}`}
              fill="none"
              stroke="#9ca3af"
              strokeWidth="1"
            />
            <text
              x={lbl.textX}
              y={lbl.labelY - 3}
              textAnchor={textAnchor}
              className="text-[13px] font-bold fill-gray-900 dark:fill-gray-100"
            >
              {lbl.label}
            </text>
            <text
              x={lbl.textX}
              y={lbl.labelY + 11}
              textAnchor={textAnchor}
              className="text-[11.5px] fill-gray-500 dark:fill-gray-400"
            >
              {lbl.percentage.toFixed(1)}%
            </text>
          </g>
        );
      })}

      <text
        x="0"
        y="-7"
        textAnchor="middle"
        className="text-[13px] font-medium fill-gray-500 dark:fill-gray-400"
      >
        Total
      </text>
      <text
        x="0"
        y="15"
        textAnchor="middle"
        className="text-[21px] font-bold fill-gray-900 dark:fill-gray-100"
      >
        {formatDonutTotal(totalValue)}
      </text>
    </>
  );
}
