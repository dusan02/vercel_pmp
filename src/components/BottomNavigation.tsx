'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, PieChart, Star, Calendar, List } from 'lucide-react';

interface BottomNavigationProps {
  activeSection?: string;
  onSectionChange?: (section: any) => void;
}

export function BottomNavigation({ activeSection, onSectionChange }: BottomNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    {
      id: 'heatmap',
      label: 'Heatmap',
      icon: LayoutGrid,
      path: '/',
      isActive: (p: string, section?: string) => section === 'heatmap' || p === '/' || p.startsWith('/heatmap')
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: PieChart,
      path: '/#portfolio',
      isActive: (p: string, section?: string) => section === 'portfolio' || p === '/portfolio' || p.includes('portfolio')
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: Star,
      path: '/#favorites',
      isActive: (p: string, section?: string) => section === 'favorites' || p === '/favorites' || p.includes('favorites')
    },
    {
      id: 'earnings',
      label: 'Earnings',
      icon: Calendar,
      path: '/#earnings',
      isActive: (p: string, section?: string) => section === 'earnings' || p === '/earnings' || p.includes('earnings')
    },
    {
      id: 'all-stocks',
      label: 'All Stocks',
      icon: List,
      path: '/#all-stocks',
      isActive: (p: string, section?: string) => section === 'allStocks' || section === 'all-stocks' || p === '/stocks' || p.includes('stocks')
    }
  ];

  const handleNavigation = (item: typeof navItems[0]) => {
    if (onSectionChange) {
      // Convert id to expected section name if needed (e.g. all-stocks -> allStocks)
      // MobileShell expects: 'heatmap' | 'portfolio' | 'favorites' | 'earnings' | 'allStocks'
      const sectionName = item.id === 'all-stocks' ? 'allStocks' : item.id;
      onSectionChange(sectionName);
    } else {
      router.push(item.path);
    }
  };

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 w-full border-t border-gray-800 z-[100] pb-safe"
      style={{ backgroundColor: '#0f0f0f' }}
    >
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(pathname, activeSection);

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item)}
              className={`flex flex-col items-center justify-center w-full h-full active:bg-gray-100 dark:active:bg-gray-800 transition-colors ${active ? 'text-blue-600' : 'text-[var(--clr-subtext)]'
                }`}
              aria-label={item.label}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}