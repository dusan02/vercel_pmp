'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutGrid, PieChart, Star, Calendar, Zap } from 'lucide-react';

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
      id: 'movers',
      label: 'Movers',
      icon: Zap,
      path: '/#movers',
      isActive: (section?: string) => section === 'movers'
    }
  ];

  const handleNavigation = (item: typeof navItems[0]) => {
    if (onSectionChange) {
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
      className="lg:hidden fixed bottom-0 left-0 w-full border-t border-gray-200 dark:border-gray-800 z-[110]
        bg-white dark:bg-[#0f0f0f]"
      style={{
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
              className={`flex flex-col items-center justify-center w-full h-full transition-all rounded-lg gap-0.5
                ${active
                  ? 'text-blue-600 bg-blue-600/10'
                  : 'text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-[9px] leading-none ${active ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
