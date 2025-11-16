'use client';
import React, { useRef, useState, useEffect } from 'react';
import { usePullToRefresh } from '../hooks/useSwipeGestures';

interface PullToRefreshProps {
  children: React.ReactNode;
  onRefresh: () => Promise<void> | void;
  threshold?: number;
  resistance?: number;
  className?: string;
  disabled?: boolean;
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  resistance = 0.6,
  className = '',
  disabled = false
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client side to prevent hydration mismatches
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleRefresh = async () => {
    if (disabled || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Pull-to-refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Only call the hook on the client side
  const { isPulling } = usePullToRefresh(containerRef as React.RefObject<HTMLElement>, handleRefresh, {
    threshold,
    resistance
  });

  // Update pull distance for visual feedback - only on client
  useEffect(() => {
    if (!isClient) return;
    
    const element = containerRef.current;
    if (!element) return;

    const handleTouchMove = (e: TouchEvent) => {
      if (disabled) return;
      
      const touch = e.touches[0];
      if (!touch) return;
      const rect = element.getBoundingClientRect();
      const pullDistance = Math.max(0, (rect.top - touch.clientY) * resistance);
      
      setPullDistance(pullDistance);
    };

    const handleTouchEnd = () => {
      setPullDistance(0);
    };

    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isClient, disabled, resistance]);

  // Add spinner styles - only on client
  useEffect(() => {
    if (!isClient) return;
    
    const spinnerStyles = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;

    // Check if styles already exist
    const existingStyle = document.getElementById('pull-to-refresh-styles');
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = 'pull-to-refresh-styles';
      style.textContent = spinnerStyles;
      document.head.appendChild(style);
    }

    return () => {
      const style = document.getElementById('pull-to-refresh-styles');
      if (style) {
        style.remove();
      }
    };
  }, [isClient]);

  // Only calculate these values on the client side
  const showRefreshIndicator = isClient && pullDistance > 20;
  const shouldTriggerRefresh = isClient && pullDistance >= threshold;

  return (
    <div
      ref={containerRef}
      className={`pull-to-refresh-container ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        touchAction: 'pan-y'
      }}
    >
      {/* Pull-to-refresh indicator - only render on client */}
      {isClient && showRefreshIndicator && (
        <div
          className="pull-to-refresh-indicator"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: `${Math.min(pullDistance, threshold)}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: shouldTriggerRefresh ? '#16a34a' : '#f3f4f6',
            color: shouldTriggerRefresh ? 'white' : '#6b7280',
            fontSize: '0.875rem',
            fontWeight: 600,
            zIndex: 1000,
            transition: 'all 0.2s ease',
            transform: `translateY(${Math.min(pullDistance, threshold)}px)`
          }}
        >
          {isRefreshing ? (
            <div className="refresh-loading">
              <div className="spinner" style={{
                width: '20px',
                height: '20px',
                border: '2px solid currentColor',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ marginLeft: '0.5rem' }}>Refreshing...</span>
            </div>
          ) : shouldTriggerRefresh ? (
            <div className="refresh-ready">
              <span>Release to refresh</span>
            </div>
          ) : (
            <div className="refresh-pull">
              <span>Pull down to refresh</span>
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      <div
        className="pull-to-refresh-content"
        style={{
          transform: isClient && showRefreshIndicator ? `translateY(${Math.min(pullDistance, threshold)}px)` : 'none',
          transition: isClient && showRefreshIndicator ? 'none' : 'transform 0.3s ease'
        }}
      >
        {children}
      </div>

      {/* Loading overlay during refresh - only render on client */}
      {isClient && isRefreshing && (
        <div
          className="refresh-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            pointerEvents: 'none'
          }}
        >
          <div
            className="refresh-spinner"
            style={{
              width: '40px',
              height: '40px',
              border: '3px solid #f3f4f6',
              borderTop: '3px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          ></div>
        </div>
      )}
    </div>
  );
} 