'use client';
import React, { useRef, useState } from 'react';
import { useSwipeGestures } from '../hooks/useSwipeGestures';

interface SwipeableTableRowProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  className?: string;
  disabled?: boolean;
}

export function SwipeableTableRow({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  isFavorite = false,
  onToggleFavorite,
  className = '',
  disabled = false
}: SwipeableTableRowProps) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [swipeFeedback, setSwipeFeedback] = useState<'left' | 'right' | null>(null);

  // Handle swipe gestures
  useSwipeGestures(rowRef, {
    onSwipeLeft: () => {
      if (!disabled && onSwipeLeft) {
        onSwipeLeft();
        showSwipeFeedback('left');
      }
    },
    onSwipeRight: () => {
      if (!disabled && onSwipeRight) {
        onSwipeRight();
        showSwipeFeedback('right');
      }
    },
    onSwipeUp: () => {
      if (!disabled && onSwipeUp) {
        onSwipeUp();
      }
    },
    onSwipeDown: () => {
      if (!disabled && onSwipeDown) {
        onSwipeDown();
      }
    }
  }, {
    minSwipeDistance: 60,
    maxSwipeTime: 500,
    preventDefault: false
  });

  const showSwipeFeedback = (direction: 'left' | 'right') => {
    setSwipeFeedback(direction);
    setTimeout(() => setSwipeFeedback(null), 300);
  };

  // Auto-favorite on swipe if no custom handlers
  const handleSwipeLeft = onSwipeLeft || (onToggleFavorite ? () => {
    if (!isFavorite) {
      onToggleFavorite();
      showSwipeFeedback('left');
    }
  } : undefined);

  const handleSwipeRight = onSwipeRight || (onToggleFavorite ? () => {
    if (isFavorite) {
      onToggleFavorite();
      showSwipeFeedback('right');
    }
  } : undefined);

  return (
    <tr
      ref={rowRef}
      className={`
        swipeable-row
        ${swipeFeedback ? `swipe-feedback-${swipeFeedback}` : ''}
        ${disabled ? 'swipe-disabled' : ''}
        ${className}
      `}
      style={{
        position: 'relative',
        transition: 'transform 0.2s ease, background-color 0.2s ease'
      }}
    >
      {children}
      
      {/* Swipe feedback overlay */}
      {swipeFeedback && (
        <div
          className={`swipe-feedback-overlay swipe-${swipeFeedback}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: swipeFeedback === 'left' ? 'flex-start' : 'flex-end',
            padding: '0 1rem',
            backgroundColor: swipeFeedback === 'left' ? '#16a34a' : '#dc2626',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 600,
            zIndex: 10,
            pointerEvents: 'none'
          }}
        >
          {swipeFeedback === 'left' ? '❤️ Added to Favorites' : '💔 Removed from Favorites'}
        </div>
      )}
    </tr>
  );
}

// Enhanced table row with favorite functionality
interface FavoriteTableRowProps {
  children: React.ReactNode;
  ticker: string;
  isFavorite: boolean;
  onToggleFavorite: (ticker: string) => void;
  className?: string;
}

export function FavoriteTableRow({
  children,
  ticker,
  isFavorite,
  onToggleFavorite,
  className = ''
}: FavoriteTableRowProps) {
  const handleToggleFavorite = () => {
    onToggleFavorite(ticker);
  };

  return (
    <SwipeableTableRow
      onToggleFavorite={handleToggleFavorite}
      isFavorite={isFavorite}
      className={`favorite-row ${className}`}
    >
      {children}
    </SwipeableTableRow>
  );
} 