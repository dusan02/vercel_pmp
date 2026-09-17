'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const DISMISS_KEY = 'zh-hint-dismissed';

/**
 * Non-intrusive banner shown to visitors whose browser language is Chinese,
 * pointing them to the /zh pilot pages. Client-side only — no auto-redirect
 * (Google recommends against it), dismissed state persisted in localStorage.
 */
export function ZhLanguageHint() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname.startsWith('/zh')) return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    const lang = (navigator.language || '').toLowerCase();
    if (lang.startsWith('zh')) setShow(true);
  }, []);

  if (!show) return null;

  const zhHref = pathname?.startsWith('/premarket-movers')
    ? '/zh/premarket-movers'
    : '/zh';

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  };

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 flex items-center gap-3">
      <Link
        href={zhHref}
        className="flex-1 text-sm text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400"
      >
        查看中文版本 →
      </Link>
      <button
        onClick={dismiss}
        aria-label="Close"
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}
