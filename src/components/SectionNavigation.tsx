'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SectionIcon, SectionIconType } from './SectionIcon';

export interface SectionNavigationProps {
  /** Optional: called after a tab link is clicked (for side-effects like scroll reset) */
  onTabChange?: (tab: string) => void;
  /** Deprecated: ignored — active state is now derived from the URL */
  activeTab?: string;
}

interface TabConfig {
  id: string;
  label: string;
  icon: SectionIconType;
  href: string;
}

const TABS: TabConfig[] = [
  { id: 'heatmap',   label: 'Heatmap',    icon: 'heatmap',  href: '/?tab=heatmap' },
  { id: 'analysis',  label: 'Analysis',   icon: 'analysis', href: '/?tab=analysis' },
  { id: 'movers',    label: 'Movers',     icon: 'zap',      href: '/?tab=movers' },
  { id: 'portfolio', label: 'Portfolio',  icon: 'pie',      href: '/?tab=portfolio' },
  { id: 'favorites', label: 'Favorites',  icon: 'star',     href: '/?tab=favorites' },
  { id: 'earnings',  label: 'Earnings',   icon: 'calendar', href: '/?tab=earnings' },
  { id: 'allStocks', label: 'All Stocks', icon: 'globe',    href: '/?tab=allStocks' },
  { id: 'blog',      label: 'Blog',       icon: 'book',     href: '/?tab=blog' },
];

export function SectionNavigation({ onTabChange }: SectionNavigationProps) {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const tabParam    = searchParams.get('tab');

  const getActiveId = (): string => {
    if (pathname === '/blog' || pathname.startsWith('/blog/')) return 'blog';
    if (pathname === '/') return tabParam ?? 'heatmap';
    return '';
  };

  const activeId = getActiveId();

  return (
    <nav className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" aria-label="Section navigation">
      <div className="flex flex-row overflow-x-auto hide-scrollbar">
        {TABS.map((tab) => {
          const isActive = activeId === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => onTabChange?.(tab.id)}
              className={`
                flex items-center gap-2 px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors relative
                ${isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <SectionIcon type={tab.icon} size={16} />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400" />
              )}
              <div className="absolute right-0 top-3 bottom-3 w-px bg-gray-200 dark:bg-gray-700 pointer-events-none" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

