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
      className="fixed left-0 right-0 z-[2000]"
      style={{
        // CRITICAL: Use --tabbar-real-h if available (includes safe-area), otherwise fallback to --tabbar-h
        bottom: 'calc(var(--tabbar-real-h, var(--tabbar-h, 72px)) + env(safe-area-inset-bottom))',
        backgroundColor: '#0f0f0f',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.3)',
        pointerEvents: 'auto',
        padding: '12px 16px',
      }}
    >
      <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 max-w-7xl mx-auto">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white mb-1.5 flex items-center gap-2">
            <span>🍪</span>
            <span>Cookies & Privacy</span>
          </h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            We use cookies to store your preferences and favorite stocks. 
            Your data remains on your device and is not sent to servers.
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={handleAccept}
            className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-lg"
            style={{
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
            }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
} 