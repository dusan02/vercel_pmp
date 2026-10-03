// Resource preloading utilities for performance optimization

interface PreloadOptions {
  as?: 'script' | 'style' | 'image' | 'font' | 'fetch';
  crossorigin?: 'anonymous' | 'use-credentials';
  type?: string;
  media?: string;
}

export function preloadResource(href: string, options: PreloadOptions = {}) {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  
  if (options.as) link.setAttribute('as', options.as);
  if (options.crossorigin) link.setAttribute('crossorigin', options.crossorigin);
  if (options.type) link.setAttribute('type', options.type);
  if (options.media) link.setAttribute('media', options.media);

  document.head.appendChild(link);
}

export function preloadImage(src: string) {
  preloadResource(src, { as: 'image' });
}

export function preloadFont(href: string) {
  preloadResource(href, { as: 'font', crossorigin: 'anonymous' });
}

export function preloadScript(src: string) {
  preloadResource(src, { as: 'script' });
}

export function preloadStyle(href: string) {
  preloadResource(href, { as: 'style' });
}

// DNS prefetch for external domains
export function prefetchDNS(domain: string) {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = `//${domain}`;
  document.head.appendChild(link);
}

// Preconnect to external domains
export function preconnect(domain: string, options: { crossorigin?: boolean } = {}) {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = `//${domain}`;
  if (options.crossorigin) {
    link.setAttribute('crossorigin', 'anonymous');
  }
  document.head.appendChild(link);
}

// Preload critical company logos
export function preloadCriticalLogos(tickers: string[]) {
  const criticalTickers = tickers.slice(0, 10); // Preload first 10 logos
  
  criticalTickers.forEach(ticker => {
    const logoUrl = `https://logo.clearbit.com/${ticker.toLowerCase()}.com?size=32&format=webp&quality=85`;
    preloadImage(logoUrl);
  });
}

// Preload external CDN resources
export function preloadCDNResources() {
  // Preconnect to external CDNs
  preconnect('logo.clearbit.com');
  preconnect('ui-avatars.com');
  preconnect('cdn.jsdelivr.net');
  preconnect('unpkg.com');
  
  // DNS prefetch for additional domains
  prefetchDNS('fonts.googleapis.com');
  prefetchDNS('fonts.gstatic.com');
}

// Lazy load non-critical resources
export function lazyLoadResource(href: string, options: PreloadOptions = {}) {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  
  if (options.as) link.setAttribute('as', options.as);
  if (options.crossorigin) link.setAttribute('crossorigin', options.crossorigin);
  if (options.type) link.setAttribute('type', options.type);

  document.head.appendChild(link);
}

// Initialize all preloading optimizations
export function initializePreloading() {
  if (typeof window === 'undefined') return;

  // Preload CDN resources
  preloadCDNResources();
  
  // Preload critical fonts
  preloadFont('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  // Preload critical images
  preloadImage('/favicon.png');
  preloadImage('/og-image.png');
  
  // Lazy load non-critical resources
  lazyLoadResource('/manifest.json', { as: 'fetch' });
} 