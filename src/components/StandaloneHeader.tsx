import Link from 'next/link';
import { BrandLogo } from './BrandLogo';

/**
 * Slim brand strip for standalone (non-app-shell) pages — SEO landing pages
 * like /stocks, /gainers, /about have no PageHeader by design; this provides
 * minimal brand presence + a way back to the app.
 */
export function StandaloneHeader({ homeHref = '/' }: { homeHref?: string }) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="container mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <Link href={homeHref} className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0">
          <BrandLogo size={26} className="flex-shrink-0" />
          <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            PreMarket<span className="text-slate-500 dark:text-slate-400">Price</span>
          </span>
        </Link>
        <Link href={homeHref} className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
