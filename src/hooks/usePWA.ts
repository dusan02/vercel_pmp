'use client';
import { useState, useEffect, useCallback } from 'react';

interface PWAStatus {
  isOnline: boolean;
  isInstalled: boolean;
  canInstall: boolean;
  isStandalone: boolean;
  hasServiceWorker: boolean;
  isOfflineReady: boolean;
  deferredPrompt: any;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const usePWA = () => {
  const [pwaStatus, setPwaStatus] = useState<PWAStatus>({
    isOnline: true, // Always start as true to avoid hydration mismatch
    isInstalled: false,
    canInstall: false,
    isStandalone: false,
    hasServiceWorker: false,
    isOfflineReady: false,
    deferredPrompt: null
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);

  // Ensure we're on the client side
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if app is installed
  const checkInstallStatus = useCallback(() => {
    if (!isClient || typeof window === 'undefined') return;
    
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone === true;
    
    setPwaStatus(prev => ({
      ...prev,
      isInstalled: isStandalone,
      isStandalone
    }));
  }, [isClient]);

  // Register service worker
  const registerServiceWorker = useCallback(async () => {
    if (!isClient || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration);
      
      setPwaStatus(prev => ({
        ...prev,
        hasServiceWorker: true
      }));

      // Listen for service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available');
              // You can show a notification to the user here
            }
          });
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'MARKET_DATA_UPDATED') {
          console.log('Market data updated via service worker');
          // You can trigger a refresh here
        }
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      setPwaStatus(prev => ({
        ...prev,
        hasServiceWorker: false
      }));
    }
  }, [isClient]);

  // Handle beforeinstallprompt event
  const handleBeforeInstallPrompt = useCallback((event: Event) => {
    if (!isClient) return;
    
    event.preventDefault();
    const promptEvent = event as InstallPromptEvent;
    
    setPwaStatus(prev => ({
      ...prev,
      canInstall: true,
      deferredPrompt: promptEvent
    }));
  }, [isClient]);

  // Handle appinstalled event
  const handleAppInstalled = useCallback(() => {
    if (!isClient) return;
    
    console.log('PWA was installed');
    setPwaStatus(prev => ({
      ...prev,
      isInstalled: true,
      canInstall: false,
      deferredPrompt: null
    }));
  }, [isClient]);

  // Install PWA
  const installPWA = useCallback(async () => {
    if (!isClient || !pwaStatus.deferredPrompt) return;
    
    try {
      const promptEvent = pwaStatus.deferredPrompt as InstallPromptEvent;
      await promptEvent.prompt();
      
      const choiceResult = await promptEvent.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setPwaStatus(prev => ({
          ...prev,
          isInstalled: true,
          canInstall: false,
          deferredPrompt: null
        }));
      } else {
        console.log('User dismissed the install prompt');
      }
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  }, [isClient, pwaStatus.deferredPrompt]);

  // Check offline readiness
  const checkOfflineReadiness = useCallback(async () => {
    if (!isClient || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      const cache = await caches.open('premarketprice-static-v1.0.0');
      const cachedFiles = await cache.keys();
      
      setPwaStatus(prev => ({
        ...prev,
        isOfflineReady: cachedFiles.length > 0
      }));
    } catch (error) {
      console.error('Error checking offline readiness:', error);
    }
  }, [isClient]);

  // Update online status
  const updateOnlineStatus = useCallback(() => {
    if (!isClient || typeof navigator === 'undefined') return;
    
    setPwaStatus(prev => ({
      ...prev,
      isOnline: navigator.onLine
    }));
  }, [isClient]);

  // Initialize PWA
  useEffect(() => {
    if (!isClient) return;
    
    const initPWA = async () => {
      setIsLoading(true);
      
      // Check install status
      checkInstallStatus();
      
      // Register service worker
      await registerServiceWorker();
      
      // Check offline readiness
      await checkOfflineReadiness();
      
      // Add event listeners
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);
      window.addEventListener('online', updateOnlineStatus);
      window.addEventListener('offline', updateOnlineStatus);
      
      // Update online status after everything is initialized
      updateOnlineStatus();
      
      setIsLoading(false);
    };

    initPWA();

    // Cleanup
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
        window.removeEventListener('online', updateOnlineStatus);
        window.removeEventListener('offline', updateOnlineStatus);
      }
    };
  }, [isClient, checkInstallStatus, registerServiceWorker, checkOfflineReadiness, handleBeforeInstallPrompt, handleAppInstalled, updateOnlineStatus]);

  // Background sync (if supported)
  const triggerBackgroundSync = useCallback(async () => {
    if (!isClient || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('sync' in registration) {
        await (registration as any).sync.register('background-sync');
        console.log('Background sync registered');
      }
    } catch (error) {
      console.error('Background sync failed:', error);
    }
  }, [isClient]);

  // Periodic background sync (if supported)
  const registerPeriodicSync = useCallback(async () => {
    if (!isClient || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    
    try {
      const registration = await navigator.serviceWorker.ready;
      if ('periodicSync' in registration) {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync' as PermissionName
        });
        
        if (status.state === 'granted') {
          await (registration as any).periodicSync.register('market-data-sync', {
            minInterval: 24 * 60 * 60 * 1000 // 24 hours
          });
          console.log('Periodic sync registered');
        }
      }
    } catch (error) {
      console.error('Periodic sync registration failed:', error);
    }
  }, [isClient]);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    if (!isClient || typeof window === 'undefined' || !('Notification' in window)) return false;
    
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }, [isClient]);

  // Show notification
  const showNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (!isClient || typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;
    
    return new Notification(title, options);
  }, [isClient]);

  return {
    ...pwaStatus,
    isLoading,
    installPWA,
    triggerBackgroundSync,
    registerPeriodicSync,
    requestNotificationPermission,
    showNotification
  };
}; 