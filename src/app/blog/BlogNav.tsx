'use client';

import Link from 'next/link';
import { SectionIcon, SectionIconType } from '@/components/SectionIcon';

interface NavItem {
  id: string;
  label: string;
  icon: SectionIconType;
  href: string;
}

const navItems: NavItem[] = [
  { id: 'heatmap',   label: 'Heatmap',    icon: 'heatmap',   href: '/?tab=heatmap' },
  { id: 'analysis',  label: 'Analysis',   icon: 'analysis',  href: '/?tab=analysis' },
  { id: 'movers',    label: 'Movers',     icon: 'zap',       href: '/?tab=movers' },
  { id: 'portfolio', label: 'Portfolio',  icon: 'pie',       href: '/?tab=portfolio' },
  { id: 'favorites', label: 'Favorites',  icon: 'star',      href: '/?tab=favorites' },
  { id: 'earnings',  label: 'Earnings',   icon: 'calendar',  href: '/?tab=earnings' },
  { id: 'allStocks', label: 'All Stocks', icon: 'globe',     href: '/?tab=allStocks' },
  { id: 'blog',      label: 'Blog',       icon: 'book',      href: '/blog' },
];

export function BlogNav() {
  return (
    <nav className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800" aria-label="Section navigation">
      <div className="flex flex-row overflow-x-auto hide-scrollbar">
        {navItems.map((item) => {
          const isActive = item.id === 'blog';
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`
                flex items-center gap-2 px-6 py-3 text-sm font-medium whitespace-nowrap transition-colors relative
                ${isActive
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/10'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <SectionIcon type={item.icon} size={16} />
              <span>{item.label}</span>
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
