'use client';

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { usePWA } from '@/hooks/usePWA';

interface PWAInstallPromptProps {
  onClose?: () => void;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({ onClose }) => {
  const { canInstall, isInstalled, isOnline, isOfflineReady, installPWA } = usePWA();
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Show prompt if app can be installed and user hasn't dismissed it recently
    const hasDismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissTime = hasDismissed ? parseInt(hasDismissed) : 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000; // 24 hours

    if (canInstall && !isInstalled && (now - dismissTime) > oneDay) {
      setIsVisible(true);
    }
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await installPWA();
      setIsVisible(false);
    } catch (error) {
      console.error('Install failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    onClose?.();
  };

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pwa-install-prompt">
      <div className="pwa-install-content">
        <div className="pwa-install-header">
          <div className="pwa-install-icon">
            <Smartphone size={24} />
          </div>
          <div className="pwa-install-title">
            <h3>Install PreMarketPrice</h3>
            <p>Get the app for a better experience</p>
          </div>
          <button 
            className="pwa-install-close"
            onClick={handleClose}
            aria-label="Close install prompt"
          >
            <X size={20} />
          </button>
        </div>

        <div className="pwa-install-features">
          <div className="pwa-feature">
            <div className="pwa-feature-icon">
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
            </div>
            <span>Works offline</span>
          </div>
          <div className="pwa-feature">
            <div className="pwa-feature-icon">📱</div>
            <span>App-like experience</span>
          </div>
          <div className="pwa-feature">
            <div className="pwa-feature-icon">⚡</div>
            <span>Faster loading</span>
          </div>
          <div className="pwa-feature">
            <div className="pwa-feature-icon">🔔</div>
            <span>Push notifications</span>
          </div>
        </div>

        <div className="pwa-install-actions">
          <button
            className="pwa-install-button"
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? (
              <>
                <div className="pwa-loading-spinner" />
                Installing...
              </>
            ) : (
              <>
                <Download size={16} />
                Install App
              </>
            )}
          </button>
          
          <button
            className="pwa-dismiss-button"
            onClick={handleDismiss}
          >
            Maybe later
          </button>
        </div>

        {!isOnline && (
          <div className="pwa-offline-notice">
            <WifiOff size={14} />
            <span>You're offline - app will work with cached data</span>
          </div>
        )}
      </div>
    </div>
  );
}; 