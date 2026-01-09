'use client';

import { useState, useEffect } from 'react';
import { safeGetItem, safeSetItem } from '@/lib/utils/safeStorage';

interface CookieConsentProps {
  onAccept: () => void;
}

export default function CookieConsent({ onAccept }: CookieConsentProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already given consent or declined
    // Check both localStorage and cookies for better reliability
    const checkConsent = () => {
      // Check localStorage first
      const consentValue = safeGetItem('pmp-cookie-consent');
      
      // Also check cookies as fallback (for better mobile support)
      let cookieConsent: string | null = null;
      try {
        const cookies = document.cookie.split(';');
        const consentCookie = cookies.find(c => c.trim().startsWith('pmp-consent='));
        if (consentCookie) {
          cookieConsent = consentCookie.split('=')[1]?.trim() || null;
        }
      } catch (e) {
        // Ignore cookie errors
      }
      
      // If consent exists in either localStorage or cookies, hide banner
      const hasConsent = consentValue === 'true' || consentValue === 'declined' || 
                        cookieConsent === 'true' || cookieConsent === 'declined';
      
      if (hasConsent) {
        setIsVisible(false);
        // Sync: if cookie exists but localStorage doesn't, restore it
        if (cookieConsent && !consentValue) {
          safeSetItem('pmp-cookie-consent', cookieConsent);
        }
        // Sync: if localStorage exists but cookie doesn't, restore it
        if (consentValue && !cookieConsent) {
          try {
            document.cookie = `pmp-consent=${consentValue}; max-age=31536000; path=/`;
          } catch (e) {
            // Ignore cookie errors
          }
        }
      } else {
        // Only show if no consent found anywhere
        setIsVisible(true);
      }
    };
    
    // Check immediately
    checkConsent();
    
    // Also check after a short delay (handles race conditions on mobile)
    const timeoutId = setTimeout(checkConsent, 100);
    
    return () => clearTimeout(timeoutId);
  }, []);

  const handleAccept = () => {
    // Store consent in localStorage and cookies
    safeSetItem('pmp-cookie-consent', 'true');
    try {
      document.cookie = 'pmp-consent=true; max-age=31536000; path=/'; // 1 year
    } catch (e) {
      // Ignore cookie errors in incognito mode
    }
    
    setIsVisible(false);
    onAccept();
  };

  const handleDecline = () => {
    // Store decline in localStorage and cookies
    safeSetItem('pmp-cookie-consent', 'declined');
    try {
      document.cookie = 'pmp-consent=declined; max-age=31536000; path=/'; // 1 year
    } catch (e) {
      // Ignore cookie errors in incognito mode
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div
      className="fixed left-0 right-0 z-[2000] p-4"
      style={{
        // Keep the banner ABOVE the mobile bottom tab bar and safe-area.
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        backgroundColor: 'var(--clr-bg)',
        borderTop: '1px solid var(--clr-border)',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
            🍪 Cookies & Privacy
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            We use cookies to store your preferences and favorite stocks. 
            Your data remains on your device and is not sent to servers.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 transition-colors shadow-md"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
} 