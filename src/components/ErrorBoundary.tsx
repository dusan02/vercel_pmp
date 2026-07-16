'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

async function hardReload() {
  try {
    if (typeof caches !== 'undefined' && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }

  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_recover', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    logger.error('ErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // If it's a webpack require error or chunk load error, try to reload after a delay
    if (
      error.message.includes('__webpack_require__') ||
      error.message.includes('webpack') ||
      error.message.includes('ChunkLoadError') ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to load chunk')
    ) {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          // Add simple loop prevention for ErrorBoundary as well, though it's less critical here due to delay
          const key = 'error_boundary_reload';
          const now = Date.now();
          const lastReload = parseInt(sessionStorage.getItem(key) || '0', 10);

          if (now - lastReload > 5000) {
            sessionStorage.setItem(key, now.toString());
            void hardReload();
          }
        }
      }, 1000);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary-root">
          <h1 className="error-boundary-title">Loading Error</h1>
          <p className="error-boundary-message">
            {this.state.error?.message || 'An error occurred while loading the page'}
          </p>
          <button
            onClick={() => void hardReload()}
            className="error-boundary-reload-button"
            aria-label="Reload page"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

