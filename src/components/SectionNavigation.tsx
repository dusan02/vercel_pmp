// ... imports ...
import React from 'react';
import { SectionIcon } from './SectionIcon';

export interface SectionNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface SectionConfig {
  id: string;
  label: string;
  icon: 'heatmap' | 'pie' | 'star' | 'calendar' | 'globe' | 'zap';
}

const sections: SectionConfig[] = [
  { id: 'heatmap', label: 'Heatmap', icon: 'heatmap' },
  { id: 'movers', label: 'Movers', icon: 'zap' },
  { id: 'portfolio', label: 'Portfolio', icon: 'pie' },
  { id: 'favorites', label: 'Favorites', icon: 'star' },
  { id: 'earnings', label: 'Earnings', icon: 'calendar' },
  { id: 'allStocks', label: 'All Stocks', icon: 'globe' },
];

export function SectionNavigation({ activeTab, onTabChange }: SectionNavigationProps) {
  return (
    <nav className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" aria-label="Section navigation">
      <div className="flex flex-row overflow-x-auto hide-scrollbar">
        {sections.map((section) => {
          const isActive = activeTab === section.id;

          return (
            <button
              key={section.id}
              onClick={() => onTabChange(section.id)}
              className={`
                                flex items-center gap-2 px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors relative
                                ${isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
                            `}
              aria-current={isActive ? 'page' : undefined}
            >
              <SectionIcon type={section.icon} size={16} />
              <span>{section.label}</span>

              {/* Active Indicator Bottom Border */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}

              {/* Right Border separator (Finviz styleish) */}
              <div className="absolute right-0 top-3 bottom-3 w-px bg-gray-200 dark:bg-gray-700 pointer-events-none" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}

