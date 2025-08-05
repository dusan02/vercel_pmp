'use client';
import React from 'react';
import { AdaptiveTableDemo } from '@/components/AdaptiveTableDemo';

export default function TestAdaptivePage() {
  return (
    <div className="test-adaptive-page">
      <header className="page-header">
        <h1>🧪 Adaptive Table Test</h1>
        <p>Test the adaptive table functionality that automatically adjusts columns based on screen size</p>
      </header>
      
      <AdaptiveTableDemo />
      
      <footer className="page-footer">
        <p>
          <strong>Instructions:</strong> Resize your browser window or use Chrome DevTools Device Toolbar to test different screen sizes.
        </p>
        <p>
          <strong>Expected behavior:</strong>
        </p>
        <ul>
          <li>📱 <strong>Mobile (≤768px):</strong> 5 columns (Logo, Ticker, Price, % Change, Favorites)</li>
          <li>📱 <strong>Tablet (769-1024px):</strong> 7 columns (+ Company Name, Market Cap)</li>
          <li>🖥️ <strong>Desktop (&gt;1024px):</strong> 8 columns (+ Market Cap Diff)</li>
        </ul>
      </footer>
    </div>
  );
} 