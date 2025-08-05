'use client';
import React, { useEffect, useRef, useState } from 'react';

interface PerformanceMetrics {
  fcp: number | null;
  lcp: number | null;
  fid: number | null;
  cls: number | null;
  ttfb: number | null;
}

interface PerformanceOptimizerProps {
  children: React.ReactNode;
  enableMonitoring?: boolean;
  enableLazyLoading?: boolean;
  enableImageOptimization?: boolean;
}

export function PerformanceOptimizer({
  children,
  enableMonitoring = true,
  enableLazyLoading = true,
  enableImageOptimization = true
}: PerformanceOptimizerProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null
  });
  const [isOptimized, setIsOptimized] = useState(false);
  const observerRef = useRef<PerformanceObserver | null>(null);

  // Performance monitoring
  useEffect(() => {
    if (!enableMonitoring || typeof window === 'undefined') return;

    // Measure TTFB
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigationEntry) {
      setMetrics(prev => ({
        ...prev,
        ttfb: navigationEntry.responseStart - navigationEntry.requestStart
      }));
    }

    // Set up Performance Observer for Core Web Vitals
    if ('PerformanceObserver' in window) {
      try {
        observerRef.current = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            switch (entry.entryType) {
              case 'paint':
                if (entry.name === 'first-contentful-paint') {
                  setMetrics(prev => ({ ...prev, fcp: entry.startTime }));
                }
                break;
              case 'largest-contentful-paint':
                setMetrics(prev => ({ ...prev, lcp: entry.startTime }));
                break;
              case 'first-input':
                setMetrics(prev => ({ ...prev, fid: (entry as any).processingStart - (entry as any).startTime }));
                break;
              case 'layout-shift':
                const layoutShiftEntry = entry as any;
                if (!layoutShiftEntry.hadRecentInput) {
                  setMetrics(prev => ({ ...prev, cls: (prev.cls || 0) + layoutShiftEntry.value }));
                }
                break;
            }
          }
        });

        observerRef.current.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift'] });
      } catch (error) {
        console.warn('Performance monitoring not supported:', error);
      }
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enableMonitoring]);

  // Image optimization
  useEffect(() => {
    if (!enableImageOptimization || typeof window === 'undefined') return;

    const optimizeImages = () => {
      const images = document.querySelectorAll('img[data-src]');
      const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            img.src = img.dataset.src || '';
            img.classList.remove('lazy');
            imageObserver.unobserve(img);
          }
        });
      });

      images.forEach(img => imageObserver.observe(img));
    };

    // Run after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', optimizeImages);
    } else {
      optimizeImages();
    }

    return () => {
      document.removeEventListener('DOMContentLoaded', optimizeImages);
    };
  }, [enableImageOptimization]);

  // Lazy loading optimization
  useEffect(() => {
    if (!enableLazyLoading || typeof window === 'undefined') return;

    const lazyLoadElements = () => {
      const lazyElements = document.querySelectorAll('[data-lazy]');
      const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const element = entry.target as HTMLElement;
            element.classList.remove('lazy-hidden');
            element.classList.add('lazy-loaded');
            lazyObserver.unobserve(element);
          }
        });
      });

      lazyElements.forEach(element => lazyObserver.observe(element));
    };

    // Run after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', lazyLoadElements);
    } else {
      lazyLoadElements();
    }

    return () => {
      document.removeEventListener('DOMContentLoaded', lazyLoadElements);
    };
  }, [enableLazyLoading]);

  // Performance optimization complete
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsOptimized(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // Log performance metrics in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && metrics.fcp !== null) {
      console.log('🚀 Performance Metrics:', {
        FCP: `${metrics.fcp.toFixed(2)}ms`,
        LCP: metrics.lcp ? `${metrics.lcp.toFixed(2)}ms` : 'Pending',
        FID: metrics.fid ? `${metrics.fid.toFixed(2)}ms` : 'Pending',
        CLS: metrics.cls ? metrics.cls.toFixed(4) : 'Pending',
        TTFB: metrics.ttfb ? `${metrics.ttfb.toFixed(2)}ms` : 'Pending'
      });
    }
  }, [metrics]);

  return (
    <div className={`performance-optimizer ${isOptimized ? 'optimized' : ''}`}>
      {children}
      
      {/* Performance monitoring overlay (development only) */}
      {process.env.NODE_ENV === 'development' && enableMonitoring && (
        <div className="performance-monitor" style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          zIndex: 10000,
          fontFamily: 'monospace'
        }}>
          <div>FCP: {metrics.fcp ? `${metrics.fcp.toFixed(0)}ms` : '...'}</div>
          <div>LCP: {metrics.lcp ? `${metrics.lcp.toFixed(0)}ms` : '...'}</div>
          <div>CLS: {metrics.cls ? metrics.cls.toFixed(4) : '...'}</div>
        </div>
      )}
    </div>
  );
}

// Hook for performance monitoring
export function usePerformanceMonitoring() {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Get initial metrics
    const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navigationEntry) {
      setMetrics(prev => ({
        ...prev,
        ttfb: navigationEntry.responseStart - navigationEntry.requestStart
      }));
    }

    // Monitor for paint events
    const paintEntries = performance.getEntriesByType('paint');
    const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    if (fcpEntry) {
      setMetrics(prev => ({ ...prev, fcp: fcpEntry.startTime }));
    }

    // Set up observer for dynamic metrics
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          switch (entry.entryType) {
            case 'largest-contentful-paint':
              setMetrics(prev => ({ ...prev, lcp: entry.startTime }));
              break;
            case 'first-input':
              setMetrics(prev => ({ ...prev, fid: (entry as any).processingStart - (entry as any).startTime }));
              break;
            case 'layout-shift':
              const layoutShiftEntry = entry as any;
              if (!layoutShiftEntry.hadRecentInput) {
                setMetrics(prev => ({ ...prev, cls: (prev.cls || 0) + layoutShiftEntry.value }));
              }
              break;
          }
        }
      });

      observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });

      return () => observer.disconnect();
    }
  }, []);

  return metrics;
} 