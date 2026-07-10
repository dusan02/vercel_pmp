import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Mobile gesture detection hook
 */
export function useMobileGestures() {
  const [gestures, setGestures] = useState({
    swipeLeft: false,
    swipeRight: false,
    swipeUp: false,
    swipeDown: false,
    pinch: false,
    tap: false
  });
  
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchEndRef = useRef<{ x: number; y: number; time: number } | null>(null);
  
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches && e.touches[0]) {
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
  }, []);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches && e.changedTouches[0]) {
      const touch = e.changedTouches[0];
      touchEndRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
    }
    
    if (touchStartRef.current && touchEndRef.current) {
      const deltaX = touchEndRef.current.x - touchStartRef.current.x;
      const deltaY = touchEndRef.current.y - touchStartRef.current.y;
      const deltaTime = touchEndRef.current.time - touchStartRef.current.time;
      
      const minSwipeDistance = 50;
      const maxSwipeTime = 300;
      
      if (deltaTime < maxSwipeTime) {
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
          if (Math.abs(deltaX) > minSwipeDistance) {
            setGestures(prev => ({
              ...prev,
              swipeLeft: deltaX > 0,
              swipeRight: deltaX < 0,
              swipeUp: false,
              swipeDown: false
            }));
          }
        } else {
          if (Math.abs(deltaY) > minSwipeDistance) {
            setGestures(prev => ({
              ...prev,
              swipeUp: deltaY < 0,
              swipeDown: deltaY > 0,
              swipeLeft: false,
              swipeRight: false
            }));
          }
        }
      }
    }
    
    // Reset gestures after short delay
    setTimeout(() => {
      setGestures({
        swipeLeft: false,
        swipeRight: false,
        swipeUp: false,
        swipeDown: false,
        pinch: false,
        tap: false
      });
    }, 100);
  }, []);
  
  return {
    gestures,
    handleTouchStart,
    handleTouchEnd
  };
}

/**
 * Mobile viewport detection hook
 */
export function useMobileViewport() {
  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    orientation: 'portrait' as 'portrait' | 'landscape'
  });
  
  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setViewport({
        width,
        height,
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        orientation: width > height ? 'landscape' : 'portrait'
      });
    };
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
    };
  }, []);
  
  return viewport;
}

/**
 * Mobile-optimized scroll hook
 */
export function useMobileScroll() {
  const [scrollState, setScrollState] = useState({
    isScrolling: false,
    scrollDirection: 'up' as 'up' | 'down',
    scrollY: 0,
    velocity: 0
  });
  
  const lastScrollYRef = useRef(0);
  const velocityRef = useRef(0);
  
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const direction = currentScrollY > lastScrollYRef.current ? 'down' : 'up';
      const velocity = Math.abs(currentScrollY - lastScrollYRef.current);
      
      velocityRef.current = velocity;
      
      setScrollState({
        isScrolling: true,
        scrollDirection: direction,
        scrollY: currentScrollY,
        velocity
      });
      
      lastScrollYRef.current = currentScrollY;
      
      // Clear existing timeout
      clearTimeout(scrollTimeout);
      
      // Set scrolling to false after scroll ends
      scrollTimeout = setTimeout(() => {
        setScrollState(prev => ({
          ...prev,
          isScrolling: false,
          velocity: 0
        }));
        velocityRef.current = 0;
      }, 150);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);
  
  return scrollState;
}

/**
 * Mobile haptic feedback hook
 */
export function useMobileHaptic() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);
  
  const tapHaptic = useCallback(() => {
    vibrate(10);
  }, [vibrate]);
  
  const successHaptic = useCallback(() => {
    vibrate([10, 50, 10]);
  }, [vibrate]);
  
  const errorHaptic = useCallback(() => {
    vibrate([100, 50, 100]);
  }, [vibrate]);
  
  return {
    vibrate,
    tapHaptic,
    successHaptic,
    errorHaptic,
    isSupported: 'vibrate' in navigator
  };
}
