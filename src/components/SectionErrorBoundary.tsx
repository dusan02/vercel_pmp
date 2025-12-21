'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/lib/utils/logger';

interface SectionErrorBoundaryProps {
  children: ReactNode;
  sectionName: string;
  fallback?: ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary for individual sections
 * Prevents one section's error from crashing the entire page
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  constructor(props: SectionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SectionErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error(`SectionErrorBoundary: Error in ${this.props.sectionName}`, error, {
      sectionName: this.props.sectionName,
      componentStack: errorInfo.componentStack,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="section-error-fallback">
          <div className="section-error-content">
            <h3 className="section-error-title">Error loading {this.props.sectionName}</h3>
            <p className="section-error-message">
              {this.state.error?.message || 'An error occurred while loading this section'}
            </p>
            <button
              onClick={this.handleReload}
              className="section-error-button"
              aria-label={`Reload ${this.props.sectionName} section`}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

