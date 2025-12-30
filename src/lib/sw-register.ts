// Service Worker Registration Utility


interface BeforeInstallPromptEvent extends Event {
  prompt(): void;
  userChoice: Promise<{ outcome: string }>;
}

// Global variables to store the deferred prompt and install button reference
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installButton: HTMLButtonElement | null = null;

export async function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  
  // Check if already registered to avoid duplicate registrations
  try {
    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration) {
      return existingRegistration;
    }
  } catch (e) {
    // Ignore errors when checking for existing registration
  }
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('Service Worker registered successfully:', registration);
    // Handle service worker updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            if (confirm('New version available! Reload to update?')) {
              window.location.reload();
            }
          }
        });
      }
    });
    // Handle service worker messages
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'SKIP_WAITING') {
        window.location.reload();
      }
    });
    return registration;
  } catch (error: any) {
    // Silently handle AbortError and other expected errors
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      // Registration was aborted, likely due to navigation or component unmount
      return;
    }
    // Only log unexpected errors
    console.error('Service Worker registration failed:', error);
  }
}

export async function unregisterServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.unregister();
      console.log('Service Worker unregistered successfully');
    }
  } catch (error) {
    console.error('Service Worker unregistration failed:', error);
  }
}

export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

export function sendNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }
  if (Notification.permission === 'granted') {
    new Notification(title, {
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      ...options,
    });
  }
}

export async function registerBackgroundSync(tag: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (registration as { sync?: { register: (tag: string) => Promise<void> } }).sync?.register(tag);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Background sync registration failed:', error);
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initializePWA() {
  if (typeof window === 'undefined') return;
  await registerServiceWorker();
  window.addEventListener('beforeinstallprompt', (e: any) => {
    const event = e as BeforeInstallPromptEvent;
    event.preventDefault();
    deferredPrompt = event;
    installButton = document.getElementById('install-pwa') as HTMLButtonElement | null;
    if (installButton) {
      installButton.style.display = 'block';
      installButton.addEventListener('click', async () => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log(`User response to the install prompt: ${outcome}`);
          deferredPrompt = null;
          if (installButton) installButton.style.display = 'none';
        }
      }, { once: true });
    }
  });
}