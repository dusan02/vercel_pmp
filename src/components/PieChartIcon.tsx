'use client';

import React from 'react';

interface PieChartIconProps {
  variant?: 'simple' | 'detailed' | 'donut' | 'segmented' | 'minimal' | 'flat';
  size?: number;
  className?: string;
}

export const PieChartIcon: React.FC<PieChartIconProps> = ({ 
  variant = 'simple',
  size = 24,
  className = ''
}) => {
  const viewBox = `0 0 ${size} ${size}`;
  
  // Simple pie chart - basic circle with one segment
  const SimplePie = () => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx={size/2} cy={size/2} r={size/2 - 2} fill="currentColor" opacity="0.1" />
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} 2 A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size - 2} ${size/2} Z`}
        fill="currentColor"
      />
    </svg>
  );

  // Detailed pie chart - multiple segments
  const DetailedPie = () => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx={size/2} cy={size/2} r={size/2 - 2} fill="currentColor" opacity="0.1" />
      {/* Segment 1 - 40% */}
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} 2 A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size * 0.7} ${size * 0.15} Z`}
        fill="currentColor"
        opacity="0.8"
      />
      {/* Segment 2 - 30% */}
      <path 
        d={`M ${size/2} ${size/2} L ${size * 0.7} ${size * 0.15} A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size - 2} ${size * 0.4} Z`}
        fill="currentColor"
        opacity="0.6"
      />
      {/* Segment 3 - 30% */}
      <path 
        d={`M ${size/2} ${size/2} L ${size - 2} ${size * 0.4} A ${size/2 - 2} ${size/2 - 2} 0 1 1 ${size/2} ${size - 2} Z`}
        fill="currentColor"
        opacity="0.4"
      />
    </svg>
  );

  // Donut chart - pie with hole in center
  const DonutChart = () => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx={size/2} cy={size/2} r={size/2 - 2} fill="currentColor" opacity="0.1" />
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} 2 A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size - 2} ${size/2} Z`}
        fill="currentColor"
      />
      <circle cx={size/2} cy={size/2} r={size/4} fill="var(--clr-bg, white)" />
    </svg>
  );

  // Segmented pie chart - 4 equal segments
  const SegmentedPie = () => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx={size/2} cy={size/2} r={size/2 - 2} fill="currentColor" opacity="0.1" />
      {/* Top segment */}
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} 2 A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size - 2} ${size/2} Z`}
        fill="currentColor"
        opacity="0.9"
      />
      {/* Right segment */}
      <path 
        d={`M ${size/2} ${size/2} L ${size - 2} ${size/2} A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size/2} ${size - 2} Z`}
        fill="currentColor"
        opacity="0.7"
      />
      {/* Bottom segment */}
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} ${size - 2} A ${size/2 - 2} ${size/2 - 2} 0 0 1 2 ${size/2} Z`}
        fill="currentColor"
        opacity="0.5"
      />
      {/* Left segment */}
      <path 
        d={`M ${size/2} ${size/2} L 2 ${size/2} A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size/2} 2 Z`}
        fill="currentColor"
        opacity="0.3"
      />
    </svg>
  );

  // Minimal pie chart - very simple
  const MinimalPie = () => (
    <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx={size/2} cy={size/2} r={size/2 - 2} stroke="currentColor" strokeWidth="2" fill="none" />
      <path 
        d={`M ${size/2} ${size/2} L ${size/2} 2 A ${size/2 - 2} ${size/2 - 2} 0 0 1 ${size * 0.85} ${size * 0.3} Z`}
        fill="currentColor"
      />
    </svg>
  );

  // Flat design pie chart with 4 segments (blue, red, green, orange)
  const FlatPieChart = () => {
    const center = size / 2;
    const radius = size / 2 - 2;
    const strokeWidth = 1.5; // Thin white separator lines
    
    // Calculate angles for 4 segments (approximately: 40%, 30%, 20%, 10%)
    // Segment 1: Blue - 40% (144 degrees)
    // Segment 2: Red - 30% (108 degrees) 
    // Segment 3: Green - 20% (72 degrees)
    // Segment 4: Orange - 10% (36 degrees)
    
    const angle1 = 144; // 40%
    const angle2 = 108; // 30%
    const angle3 = 72;  // 20%
    const angle4 = 36;  // 10%
    
    const toRadians = (deg: number) => (deg * Math.PI) / 180;
    
    // Helper function to calculate point on circle
    const getPoint = (angle: number) => {
      const rad = toRadians(angle - 90); // Start from top
      return {
        x: center + radius * Math.cos(rad),
        y: center + radius * Math.sin(rad)
      };
    };
    
    // Segment 1: Blue (40% - 144 degrees, starts at 0°)
    const p1 = getPoint(0);
    const p2 = getPoint(angle1);
    
    // Segment 2: Red (30% - 108 degrees, starts at 144°)
    const p3 = getPoint(angle1 + angle2);
    
    // Segment 3: Green (20% - 72 degrees, starts at 252°)
    const p4 = getPoint(angle1 + angle2 + angle3);
    
    // Segment 4: Orange (10% - 36 degrees, starts at 324°)
    
    return (
      <svg width={size} height={size} viewBox={viewBox} fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        {/* Segment 1: Blue - 40% */}
        <path 
          d={`M ${center} ${center} L ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y} Z`}
          fill="#3b82f6"
        />
        
        {/* Segment 2: Red - 30% */}
        <path 
          d={`M ${center} ${center} L ${p2.x} ${p2.y} A ${radius} ${radius} 0 0 1 ${p3.x} ${p3.y} Z`}
          fill="#ef4444"
        />
        
        {/* Segment 3: Green - 20% */}
        <path 
          d={`M ${center} ${center} L ${p3.x} ${p3.y} A ${radius} ${radius} 0 0 1 ${p4.x} ${p4.y} Z`}
          fill="#22c55e"
        />
        
        {/* Segment 4: Orange - 10% */}
        <path 
          d={`M ${center} ${center} L ${p4.x} ${p4.y} A ${radius} ${radius} 0 0 1 ${p1.x} ${p1.y} Z`}
          fill="#f97316"
        />
        
        {/* White separator lines */}
        <line x1={center} y1={center} x2={p1.x} y2={p1.y} stroke="white" strokeWidth={strokeWidth} />
        <line x1={center} y1={center} x2={p2.x} y2={p2.y} stroke="white" strokeWidth={strokeWidth} />
        <line x1={center} y1={center} x2={p3.x} y2={p3.y} stroke="white" strokeWidth={strokeWidth} />
        <line x1={center} y1={center} x2={p4.x} y2={p4.y} stroke="white" strokeWidth={strokeWidth} />
      </svg>
    );
  };

  switch (variant) {
    case 'detailed':
      return <DetailedPie />;
    case 'donut':
      return <DonutChart />;
    case 'segmented':
      return <SegmentedPie />;
    case 'minimal':
      return <MinimalPie />;
    case 'flat':
      return <FlatPieChart />;
    case 'simple':
    default:
      return <SimplePie />;
  }
};

