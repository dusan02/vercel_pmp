/**
 * Hook pre Pan & Zoom funkcionalitu
 * Podporuje touch gestures (pinch-to-zoom, pan) aj mouse (wheel zoom, drag)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useGesture } from '@use-gesture/react';

export interface PanZoomState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface UsePanZoomOptions {
  /** Minimálny zoom level (default: 1) */
  minZoom?: number;
  /** Maximálny zoom level (default: 5) */
  maxZoom?: number;
  /** Počiatočný zoom (default: 1) */
  initialZoom?: number;
  /** Počiatočný pan X (default: 0) */
  initialPanX?: number;
  /** Počiatočný pan Y (default: 0) */
  initialPanY?: number;
  /** Povoliť pan & zoom len na mobile (default: false) */
  mobileOnly?: boolean;
  /** Callback pri zmene zoom/pan */
  onChange?: (state: PanZoomState) => void;
  /** Povoliť double-tap reset (default: true) */
  enableDoubleTapReset?: boolean;
}

export interface UsePanZoomReturn {
  /** Aktuálny zoom level */
  zoom: number;
  /** Aktuálny pan X offset */
  panX: number;
  /** Aktuálny pan Y offset */
  panY: number;
  /** Gesture bind funkcia pre použitie v JSX */
  bind: ReturnType<typeof useGesture>;
  /** Reset na počiatočný stav */
  reset: () => void;
  /** Nastaviť zoom */
  setZoom: (zoom: number) => void;
  /** Nastaviť pan */
  setPan: (x: number, y: number) => void;
  /** Transform string pre CSS */
  transform: string;
  /** Transform origin pre CSS */
  transformOrigin: string;
}

export function usePanZoom(options: UsePanZoomOptions = {}): UsePanZoomReturn {
  const {
    minZoom = 1,
    maxZoom = 5,
    initialZoom = 1,
    initialPanX = 0,
    initialPanY = 0,
    mobileOnly = false,
    onChange,
    enableDoubleTapReset = true,
  } = options;

  const [zoom, setZoomState] = useState(initialZoom);
  const [panX, setPanX] = useState(initialPanX);
  const [panY, setPanY] = useState(initialPanY);

  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLElement | null>(null);

  // Detekcia mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Ak je mobileOnly a nie sme na mobile, vrátiť pôvodné hodnoty
  const shouldEnable = !mobileOnly || isMobile;

  // Update state a zavolať onChange callback
  const updateState = useCallback((newZoom: number, newPanX: number, newPanY: number) => {
    setZoomState(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
    if (onChange) {
      onChange({ zoom: newZoom, panX: newPanX, panY: newPanY });
    }
  }, [onChange]);

  // Reset na počiatočný stav
  const reset = useCallback(() => {
    updateState(initialZoom, initialPanX, initialPanY);
  }, [initialZoom, initialPanX, initialPanY, updateState]);

  // Nastaviť zoom
  const setZoom = useCallback((newZoom: number) => {
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    updateState(clampedZoom, panX, panY);
  }, [minZoom, maxZoom, panX, panY, updateState]);

  // Nastaviť pan
  const setPan = useCallback((x: number, y: number) => {
    updateState(zoom, x, y);
  }, [zoom, updateState]);

  // Double-tap detection pre reset
  const handleDoubleTap = useCallback((event: React.TouchEvent | React.MouseEvent) => {
    if (!enableDoubleTapReset || !shouldEnable) return;

    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300) {
      // Double tap detected - reset zoom
      event.preventDefault();
      reset();
    }
    
    lastTapRef.current = now;
  }, [enableDoubleTapReset, shouldEnable, reset]);

  // Use refs to avoid stale closures in gesture handlers
  const zoomRef = useRef(zoom);
  const panXRef = useRef(panX);
  const panYRef = useRef(panY);

  useEffect(() => {
    zoomRef.current = zoom;
    panXRef.current = panX;
    panYRef.current = panY;
  }, [zoom, panX, panY]);

  // Gesture handling
  const bind = useGesture(
    {
      // Pinch-to-zoom (touch)
      onPinch: shouldEnable ? ({ offset: [scale], first, memo = zoomRef.current }) => {
        if (first) return zoomRef.current;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, memo * scale));
        updateState(newZoom, panXRef.current, panYRef.current);
        return newZoom;
      } : undefined,

      // Drag/Pan
      onDrag: shouldEnable ? ({ offset: [x, y], first, memo = { panX: panXRef.current, panY: panYRef.current } }) => {
        if (first) return { panX: panXRef.current, panY: panYRef.current };
        updateState(zoomRef.current, memo.panX + x, memo.panY + y);
        return { panX: memo.panX + x, panY: memo.panY + y };
      } : undefined,

      // Wheel zoom (desktop) - only if not mobile only
      onWheel: shouldEnable && !mobileOnly ? ({ offset: [, deltaY], event }) => {
        event.preventDefault();
        const currentZoom = zoomRef.current;
        const currentPanX = panXRef.current;
        const currentPanY = panYRef.current;
        const zoomDelta = deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, currentZoom * zoomDelta));
        
        // Zoom towards mouse position
        if (containerRef.current && event.target) {
          const rect = containerRef.current.getBoundingClientRect();
          const mouseX = (event as WheelEvent).clientX - rect.left;
          const mouseY = (event as WheelEvent).clientY - rect.top;
          
          // Calculate new pan to zoom towards mouse
          const zoomChange = newZoom / currentZoom;
          const newPanX = currentPanX - (mouseX - currentPanX) * (zoomChange - 1);
          const newPanY = currentPanY - (mouseY - currentPanY) * (zoomChange - 1);
          
          updateState(newZoom, newPanX, newPanY);
        } else {
          updateState(newZoom, currentPanX, currentPanY);
        }
      } : undefined,
    },
    {
      // Gesture configuration
      pinch: {
        scaleBounds: { min: minZoom, max: maxZoom },
        rubberband: true,
      },
      drag: {
        filterTaps: true,
        threshold: 5,
      },
      wheel: {
        preventDefault: true,
      },
    }
  );

  // Transform string pre CSS
  const transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  const transformOrigin = '0 0';

  // Bind function that sets ref and returns gesture bind
  const bindWithRef = useCallback((element: HTMLElement | null) => {
    containerRef.current = element;
    if (element) {
      return bind(element);
    }
    return {};
  }, [bind]);

  return {
    zoom,
    panX,
    panY,
    bind: bindWithRef,
    reset,
    setZoom,
    setPan,
    transform,
    transformOrigin,
  };
}
