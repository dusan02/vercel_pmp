'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Uses ResizeObserver to track an element's size.
 * Extracted from `MarketHeatmap.tsx` so other components don't need to import that huge file.
 */
export function useElementResize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };

    measure();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize({ width, height });
      }
    });

    resizeObserver.observe(element);
    const timeoutId = setTimeout(measure, 100);

    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, []);

  return { ref, size };
}

