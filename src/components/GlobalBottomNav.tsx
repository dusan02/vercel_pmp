'use client';

/**
 * Global mobile bottom navigation — rendered on every page EXCEPT the
 * homepage (the homepage has its own section-switching BottomNavigation).
 *
 * Inner pages (gainers, earnings, stocks, analysis, blog, …) previously had
 * NO navigation at all on mobile — users were stranded with only the footer.
 * This bar gives every page one-tap access to the main sections.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Zap, Calendar, Globe } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Home', icon: Home, path: '/', match: (p: string) => p === '/' },
  { label: 'Heatmap', icon: LayoutGrid, path: '/heatmap', match: (p: string) => p.startsWith('/heatmap') },
  {
    label: 'Movers',
    icon: Zap,
    path: '/premarket-movers',
    match: (p: string) =>
      p.startsWith('/premarket-movers') ||
      p.startsWith('/gainers') ||
      p.startsWith('/losers') ||
      p.startsWith('/movers'),
  },
  { label: 'Earnings', icon: Calendar, path: '/earnings', match: (p: string) => p.startsWith('/earnings') },
  {
    label: 'Screener',
    icon: Globe,
    path: '/screener',
    match: (p: string) => p.startsWith('/stocks') || p.startsWith('/screener') || p.startsWith('/sectors'),
  },
];

export function GlobalBottomNav() {
  const pathname = usePathname();

  // Homepage renders its own section-switching BottomNavigation
  if (pathname === '/') return null;

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 w-full border-t border-gray-200 dark:border-gray-800 z-[110] bg-white dark:bg-[#0f0f0f]"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="flex justify-around items-center h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.match(pathname);

          return (
            <Link
              key={item.label}
              href={item.path}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center w-full h-full transition-all rounded-lg gap-0.5
                ${active
                  ? 'text-blue-600 bg-blue-600/10'
                  : 'text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800'
                }`}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className={`text-xs leading-none ${active ? 'font-semibold' : 'font-normal'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
