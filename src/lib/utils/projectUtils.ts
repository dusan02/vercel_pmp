/**
 * Utility functions for project management across multiple websites
 */

export interface ProjectConfig {
  code: string;
  name: string;
  domain: string;
  description: string;
}

// Project configurations
export const PROJECTS: Record<string, ProjectConfig> = {
  pmp: {
    code: 'pmp',
    name: 'PreMarketPrice',
    domain: 'premarketprice.com',
    description: 'Pre-market stock prices and market cap overview'
  },
  cm: {
    code: 'cm',
    name: 'CapMovers',
    domain: 'capmovers.com',
    description: 'Biggest market cap movers and changes'
  },
  gl: {
    code: 'gl',
    name: 'GainersLosers',
    domain: 'gainerslosers.com',
    description: 'Top gainers and losers by percentage'
  },
  cv: {
    code: 'cv',
    name: 'StockCV',
    domain: 'stockcv.com',
    description: 'Company fundamentals and detailed analysis'
  }
};

/**
 * Get project code from hostname
 */
export function getProjectFromHost(hostname?: string): string {
  if (!hostname) {
    // Try to get from window.location in browser
    if (typeof window !== 'undefined') {
      hostname = window.location.hostname;
    } else {
      return 'pmp'; // Default fallback
    }
  }

  const host = hostname.toLowerCase();
  
  // Check for exact domain matches
  if (host.includes('premarketprice.com')) return 'pmp';
  if (host.includes('capmovers.com')) return 'cm';
  if (host.includes('gainerslosers.com')) return 'gl';
  if (host.includes('stockcv.com')) return 'cv';
  
  // Check for localhost development
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return 'pmp'; // Default to PMP for local development
  }
  
  // Check for Vercel preview domains
  if (host.includes('vercel.app')) {
    // You can add logic here to detect project from Vercel preview URLs
    // For now, default to PMP
    return 'pmp';
  }
  
  return 'pmp'; // Default fallback
}

/**
 * Detect project from domain (alias for getProjectFromHost with type safety)
 */
export function detectProjectFromDomain(domain: string): 'pmp' | 'cm' | 'gl' | 'cv' {
  const lowerDomain = domain.toLowerCase();
  if (lowerDomain.includes("premarketprice")) return "pmp";
  if (lowerDomain.includes("capmovers")) return "cm";
  if (lowerDomain.includes("gainerslosers")) return "gl";
  if (lowerDomain.includes("stockcv")) return "cv";
  return "pmp"; // fallback
}

/**
 * Get project configuration
 */
export function getProjectConfig(projectCode?: string): ProjectConfig {
  const code = projectCode || getProjectFromHost();
  const config = PROJECTS[code as keyof typeof PROJECTS];
  return (config || PROJECTS.pmp) as ProjectConfig;
}

/**
 * Get cache key prefix for project
 */
export function getProjectCachePrefix(projectCode?: string): string {
  const code = projectCode || getProjectFromHost();
  // Validate that the code is a valid project
  if (['pmp', 'cm', 'gl', 'cv'].includes(code)) {
    return code;
  }
  return 'pmp'; // fallback to PMP for invalid codes
}

/**
 * Get favorites key for project
 */
export function getFavoritesKey(projectCode?: string): string {
  const code = projectCode || getProjectFromHost();
  return `favorites-${code}`;
}

/**
 * Get API endpoint with project parameter
 */
export function getStocksApiUrl(tickers: string[], projectCode?: string): string {
  const code = projectCode || getProjectFromHost();
  const tickerParam = tickers.join(',');
  return `/api/stocks?tickers=${tickerParam}&project=${code}`;
}

/**
 * Check if current project is PMP (main project)
 */
export function isMainProject(projectCode?: string): boolean {
  const code = projectCode || getProjectFromHost();
  return code === 'pmp';
}

/**
 * Get project-specific title
 */
export function getProjectTitle(projectCode?: string): string {
  const config = getProjectConfig(projectCode);
  return config.name;
}

/**
 * Get project-specific description
 */
export function getProjectDescription(projectCode?: string): string {
  const config = getProjectConfig(projectCode);
  return config.description;
} 