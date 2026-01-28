'use client';

import React, { useEffect, useMemo, useState } from 'react';

type ScrollToTopButtonProps = {
  /** Show button after scrolling this many pixels */
  showAfterPx?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export default function ScrollToTopButton({ showAfterPx = 400 }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId: number | null = null;

    const getScrollTop = () => {
      // More reliable than window.scrollY across browsers / doctypes
      return document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        // Check window/body scroll
        const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY ?? 0;

        // Also check mobile container if it exists
        const mobileContainer = document.querySelector('.mobile-app-content');
        const mobileScrollTop = mobileContainer ? mobileContainer.scrollTop : 0;

        // Visible if EITHER is scrolled enough
        setVisible(Math.max(scrollTop, mobileScrollTop) >= showAfterPx);
      });
    };

    onScroll(); // init
    window.addEventListener('scroll', onScroll, { passive: true });

    // Attach to mobile container too
    const mobileContainer = document.querySelector('.mobile-app-content');
    if (mobileContainer) {
      mobileContainer.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      if (mobileContainer) {
        mobileContainer.removeEventListener('scroll', onScroll);
      }
    };
  }, [showAfterPx]);

  const behavior = useMemo(() => (prefersReducedMotion() ? 'auto' : 'smooth'), []);

  // Keep DOM clean (and avoid a11y snapshots showing the button when hidden)
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // scroll window
        window.scrollTo({ top: 0, behavior });
        // scroll mobile container
        const mobileContainer = document.querySelector('.mobile-app-content');
        if (mobileContainer) {
          mobileContainer.scrollTo({ top: 0, behavior });
        }
      }}
      aria-label="Scroll to top"
      title="Up"
      className={[
        'fixed bottom-[calc(5rem+1.25rem)] lg:bottom-16 right-5 z-[999]', // Mobile: above tabbar, Desktop: adjusted bottom
        'rounded-full shadow-lg',
        'bg-blue-600 text-white',
        'hover:bg-blue-700 active:scale-95',
        'transition-all duration-200',
        'w-12 h-12',
        'flex items-center justify-center',
        'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
        'dark:focus:ring-offset-slate-900',
        'opacity-100 pointer-events-auto translate-y-0',
      ].join(' ')}
    >
      <span className="text-sm font-bold tracking-wide">UP</span>
    </button>
  );
}


