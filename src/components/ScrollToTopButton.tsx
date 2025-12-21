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
        setVisible(getScrollTop() >= showAfterPx);
      });
    };

    onScroll(); // init
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
    };
  }, [showAfterPx]);

  const behavior = useMemo(() => (prefersReducedMotion() ? 'auto' : 'smooth'), []);

  // Keep DOM clean (and avoid a11y snapshots showing the button when hidden)
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const scroller = document.scrollingElement;
        if (scroller && typeof (scroller as any).scrollTo === 'function') {
          (scroller as any).scrollTo({ top: 0, behavior });
        } else {
          window.scrollTo({ top: 0, behavior });
        }
      }}
      aria-label="Scroll to top"
      title="Up"
      className={[
        'fixed bottom-5 right-5 z-[60]',
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


