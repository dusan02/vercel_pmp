'use client';

import React from 'react';
import { formatDonutTotal, type DonutLabelLayout } from '@/lib/utils/portfolioDonutLayout';

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
