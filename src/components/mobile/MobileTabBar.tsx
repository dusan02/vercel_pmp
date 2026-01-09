'use client';

import React from 'react';
import { PieChart, Star, Calendar, Globe } from 'lucide-react';
import { SectionIcon } from '@/components/SectionIcon';

export type MobileTab = 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

interface TabItem {
  id: MobileTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const HeatmapTabIcon: React.FC<{ size?: number; className?: string }> = ({ size = 22, className }) => (
  <SectionIcon type="heatmap" size={size} className={className || ''} />
);

const tabs: TabItem[] = [
  { id: 'heatmap', label: 'Heatmap', icon: HeatmapTabIcon },
  { id: 'portfolio', label: 'Portfolio', icon: PieChart },
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'earnings', label: 'Earnings', icon: Calendar },
  { id: 'allStocks', label: 'Stocks', icon: Globe },
];

/**
 * MobileTabBar - Moderná bottom navigation
 * Minimalistický dizajn s smooth transitions
 */
export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav className="mobile-app-tabbar" role="tablist" aria-label="Main navigation">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`mobile-app-tab ${isActive ? 'active' : ''}`}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
          >
            <div className="mobile-app-tab-icon">
              <Icon size={22} />
            </div>
            <span className="mobile-app-tab-label">{tab.label}</span>
            {isActive && <div className="mobile-app-tab-indicator" />}
          </button>
        );
      })}
    </nav>
  );
}
