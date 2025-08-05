'use client';
import React, { useState, useEffect } from 'react';
import { Smartphone, Tablet, Monitor, RotateCcw, Play, Pause } from 'lucide-react';

interface DeviceConfig {
  name: string;
  width: number;
  height: number;
  icon: React.ComponentType<any>;
  userAgent: string;
}

interface TouchEvent {
  type: 'tap' | 'swipe' | 'longpress';
  x: number;
  y: number;
  timestamp: number;
  duration?: number;
}

interface MobileTesterProps {
  children: React.ReactNode;
  enableTesting?: boolean;
  showDeviceFrame?: boolean;
}

const DEVICES: DeviceConfig[] = [
  {
    name: 'iPhone 14 Pro',
    width: 393,
    height: 852,
    icon: Smartphone,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  },
  {
    name: 'iPad Pro',
    width: 1024,
    height: 1366,
    icon: Tablet,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  },
  {
    name: 'Desktop',
    width: 1920,
    height: 1080,
    icon: Monitor,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
];

export function MobileTester({
  children,
  enableTesting = false,
  showDeviceFrame = true
}: MobileTesterProps) {
  const [selectedDevice, setSelectedDevice] = useState<DeviceConfig>(DEVICES[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [touchEvents, setTouchEvents] = useState<TouchEvent[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<any>({});
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Touch event tracking
  useEffect(() => {
    if (!enableTesting || typeof window === 'undefined') return;

    let touchStartTime = 0;
    let touchStartCoords = { x: 0, y: 0 };
    let longPressTimer: NodeJS.Timeout | null = null;

    const handleTouchStart = (e: any) => {
      const touch = e.touches[0];
      touchStartTime = Date.now();
      touchStartCoords = { x: touch.clientX, y: touch.clientY };

      // Long press detection
      longPressTimer = setTimeout(() => {
        const event: TouchEvent = {
          type: 'longpress',
          x: touch.clientX,
          y: touch.clientY,
          timestamp: Date.now(),
          duration: Date.now() - touchStartTime
        };
        setTouchEvents(prev => [...prev, event]);
      }, 500);
    };

    const handleTouchMove = (e: any) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const handleTouchEnd = (e: any) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      const touch = e.changedTouches[0];
      const touchEndTime = Date.now();
      const duration = touchEndTime - touchStartTime;
      const distance = Math.sqrt(
        Math.pow(touch.clientX - touchStartCoords.x, 2) +
        Math.pow(touch.clientY - touchStartCoords.y, 2)
      );

      let eventType: 'tap' | 'swipe' = 'tap';
      if (distance > 50) {
        eventType = 'swipe';
      }

      const event: TouchEvent = {
        type: eventType,
        x: touch.clientX,
        y: touch.clientY,
        timestamp: touchEndTime,
        duration
      };

      setTouchEvents(prev => [...prev, event]);
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      if (longPressTimer) {
        clearTimeout(longPressTimer);
      }
    };
  }, [enableTesting]);

  // Performance monitoring
  useEffect(() => {
    if (!enableTesting || typeof window === 'undefined') return;

    const measurePerformance = () => {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');
      
      const metrics = {
        loadTime: navigationEntry?.loadEventEnd - navigationEntry?.loadEventStart || 0,
        domContentLoaded: navigationEntry?.domContentLoadedEventEnd - navigationEntry?.domContentLoadedEventStart || 0,
        firstPaint: paintEntries.find(entry => entry.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paintEntries.find(entry => entry.name === 'first-contentful-paint')?.startTime || 0,
        memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
        timestamp: Date.now()
      };

      setPerformanceMetrics(metrics);
    };

    if (isRecording) {
      const interval = setInterval(measurePerformance, 1000);
      return () => clearInterval(interval);
    }
  }, [enableTesting, isRecording]);

  // Device frame styles
  const deviceFrameStyle = {
    width: selectedDevice.width,
    height: selectedDevice.height,
    maxWidth: '100%',
    maxHeight: '100vh',
    margin: '0 auto',
    border: showDeviceFrame ? '8px solid #333' : 'none',
    borderRadius: showDeviceFrame ? '20px' : '0',
    overflow: 'hidden',
    position: 'relative' as const,
    backgroundColor: '#fff',
    boxShadow: showDeviceFrame ? '0 10px 30px rgba(0,0,0,0.3)' : 'none'
  };

  if (!enableTesting) {
    return <>{children}</>;
  }

  return (
    <div className="mobile-tester">
      {/* Device selector */}
      <div className="device-selector" style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '10px',
        zIndex: 10000,
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        {DEVICES.map((device) => {
          const Icon = device.icon;
          return (
            <button
              key={device.name}
              onClick={() => setSelectedDevice(device)}
              style={{
                background: selectedDevice.name === device.name ? '#007AFF' : 'transparent',
                border: '1px solid #666',
                borderRadius: '5px',
                padding: '5px',
                cursor: 'pointer',
                color: 'white'
              }}
              title={device.name}
            >
              <Icon size={16} />
            </button>
          );
        })}
        
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          style={{
            background: 'transparent',
            border: '1px solid #666',
            borderRadius: '5px',
            padding: '5px',
            cursor: 'pointer',
            color: 'white'
          }}
          title="Toggle fullscreen"
        >
          <Monitor size={16} />
        </button>
      </div>

      {/* Recording controls */}
      <div className="recording-controls" style={{
        position: 'fixed',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '10px',
        zIndex: 10000,
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <button
          onClick={() => setIsRecording(!isRecording)}
          style={{
            background: isRecording ? '#FF3B30' : '#34C759',
            border: 'none',
            borderRadius: '5px',
            padding: '5px 10px',
            cursor: 'pointer',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          {isRecording ? <Pause size={14} /> : <Play size={14} />}
          {isRecording ? 'Stop' : 'Record'}
        </button>
        
        <button
          onClick={() => setTouchEvents([])}
          style={{
            background: 'transparent',
            border: '1px solid #666',
            borderRadius: '5px',
            padding: '5px',
            cursor: 'pointer',
            color: 'white'
          }}
          title="Clear events"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* Device frame */}
      <div className="device-frame" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '20px',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={deviceFrameStyle}>
          <div style={{
            width: '100%',
            height: '100%',
            overflow: 'auto',
            transform: `scale(${isFullscreen ? 1 : Math.min(window.innerWidth / selectedDevice.width, window.innerHeight / selectedDevice.height)})`,
            transformOrigin: 'top left'
          }}>
            {children}
          </div>
        </div>
      </div>

      {/* Touch events log */}
      {touchEvents.length > 0 && (
        <div className="touch-events-log" style={{
          position: 'fixed',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '10px',
          borderRadius: '10px',
          zIndex: 10000,
          maxWidth: '300px',
          maxHeight: '200px',
          overflow: 'auto',
          fontSize: '12px'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Touch Events ({touchEvents.length})</h4>
          {touchEvents.slice(-5).map((event, index) => (
            <div key={index} style={{ marginBottom: '5px' }}>
              <strong>{event.type}</strong> at ({event.x}, {event.y})
              {event.duration && ` - ${event.duration}ms`}
            </div>
          ))}
        </div>
      )}

      {/* Performance metrics */}
      {isRecording && (
        <div className="performance-metrics" style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '10px',
          borderRadius: '10px',
          zIndex: 10000,
          fontSize: '12px'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>Performance</h4>
          <div>Load: {performanceMetrics.loadTime?.toFixed(0)}ms</div>
          <div>DOM Ready: {performanceMetrics.domContentLoaded?.toFixed(0)}ms</div>
          <div>FCP: {performanceMetrics.firstContentfulPaint?.toFixed(0)}ms</div>
          <div>Memory: {(performanceMetrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</div>
        </div>
      )}
    </div>
  );
}

// Hook for mobile testing
export function useMobileTesting() {
  const [isMobile, setIsMobile] = useState(false);
  const [deviceType, setDeviceType] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setIsMobile(width <= 768);
      setOrientation(width > height ? 'landscape' : 'portrait');
      
      if (width <= 768) {
        setDeviceType('mobile');
      } else if (width <= 1024) {
        setDeviceType('tablet');
      } else {
        setDeviceType('desktop');
      }
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  return { isMobile, deviceType, orientation };
} 