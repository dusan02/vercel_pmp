import Link from 'next/link';

type PageKind = 'analysis' | 'valuation' | 'financials' | 'premarket';

const ROUTES: { kind: PageKind; label: string; href: (s: string) => string }[] = [
  { kind: 'analysis', label: 'Analysis', href: (s) => `/analysis/${s}` },
  { kind: 'valuation', label: 'Valuation history', href: (s) => `/valuation/${s}` },
  { kind: 'financials', label: 'Financials', href: (s) => `/financials/${s}` },
  { kind: 'premarket', label: 'Move history', href: (s) => `/premarket/${s}` },
];

/**
 * "Explore this stock" strip — sibling-page links so every ticker page
 * cross-links to the other three. Current page is rendered as plain text.
 */
export function ExploreStockNav({ ticker, current }: { ticker: string; current: PageKind }) {
  const others = ROUTES.filter((r) => r.kind !== current);
  return (
    <nav aria-label={`Explore ${ticker}`} className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-500 dark:text-gray-400 font-medium mr-1">Explore {ticker}:</span>
      {others.map((r) => (
        <Link
          key={r.kind}
          href={r.href(ticker)}
          className="px-3 py-1 rounded-full border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-blue-300 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
