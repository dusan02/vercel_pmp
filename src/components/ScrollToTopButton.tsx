'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronUp } from 'lucide-react';

type ScrollToTopButtonProps = {
  /** Show button after scrolling this many pixels */
  showAfterPx?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
}

export default function ScrollToTopButton({ showAfterPx = 300 }: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId: number | null = null;

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

  // Keep DOM clean
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
      title="Scroll to Top"
      style={{
        zIndex: 99999,
        pointerEvents: 'auto',
      }}
      className={[
        'fixed bottom-24 lg:bottom-10 right-6',
        'rounded-full shadow-xl',
        'bg-blue-600 text-white',
        'hover:bg-blue-700 hover:shadow-2xl active:scale-95',
        'transition-all duration-300 ease-in-out',
        'w-12 h-12',
        'flex items-center justify-center',
        'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
        'dark:focus:ring-offset-slate-900',
        'opacity-100 translate-y-0',
      ].join(' ')}
    >
      <ChevronUp size={28} strokeWidth={3} />
    </button>
  );
}


