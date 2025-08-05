'use client';

import { useState, useEffect } from 'react';

interface CookieConsentProps {
  onAccept: () => void;
}

export default function CookieConsent({ onAccept }: CookieConsentProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if user has already given consent
    const hasConsent = localStorage.getItem('pmp-cookie-consent');
    if (!hasConsent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    // Store consent in localStorage and cookies
    localStorage.setItem('pmp-cookie-consent', 'true');
    document.cookie = 'pmp-consent=true; max-age=31536000; path=/'; // 1 year
    
    setIsVisible(false);
    onAccept();
  };

  const handleDecline = () => {
    // Store decline in localStorage
    localStorage.setItem('pmp-cookie-consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50 p-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            🍪 Cookies & Privacy
          </h3>
          <p className="text-xs text-gray-600">
            Používame cookies na uloženie vašich preferencií a obľúbených akcií. 
            Vaše dáta zostávajú na vašom zariadení a nie sú odosielané na servery.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            Odmietnuť
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Prijať
          </button>
        </div>
      </div>
    </div>
  );
} 