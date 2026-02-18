'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, PieChart, Star, Calendar, Globe } from 'lucide-react';

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
      isActive: (section?: string) => section === 'heatmap'
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: PieChart,
      path: '/#portfolio',
      isActive: (section?: string) => section === 'portfolio'
    },
    {
      id: 'favorites',
      label: 'Favorites',
      icon: Star,
      path: '/#favorites',
      isActive: (section?: string) => section === 'favorites'
    },
    {
      id: 'earnings',
      label: 'Earnings',
      icon: Calendar,
      path: '/#earnings',
      isActive: (section?: string) => section === 'earnings'
    },
    {
      id: 'all-stocks',
      label: 'All Stocks',
      icon: Globe,
      path: '/#all-stocks',
      isActive: (section?: string) => section === 'allStocks' || section === 'all-stocks'
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
    <nav
      role="navigation"
      aria-label="Main navigation"
      className="lg:hidden fixed bottom-0 left-0 w-full border-t border-gray-800 z-[110]"
      style={{
        backgroundColor: '#0f0f0f',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)'
      }}
    >
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive(activeSection);

          return (
            <button
              key={item.id}
              onClick={() => handleNavigation(item)}
              className={`flex flex-col items-center justify-center w-full h-full transition-all rounded-lg
                ${active
                  ? 'text-blue-600 bg-blue-600/10'
                  : 'text-[var(--clr-subtext)] active:bg-gray-800'
                }`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Icon size={24} strokeWidth={active ? 2.5 : 2} />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
