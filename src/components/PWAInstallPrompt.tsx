'use client';

import React from 'react';

interface PWAInstallPromptProps {
  onClose?: () => void;
}

/**
 * PWA Install Prompt Component - DISABLED
 * 
 * This component is intentionally disabled and will never render anything.
 * It always returns null to prevent any PWA install prompt from showing,
 * even if the component is accidentally imported or used.
 */
export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = () => {
  return null;
}; 