'use client';

import React, { ReactNode } from 'react';

interface MobileAppProps {
  children: ReactNode;
}

/**
 * MobileApp - Moderný hlavný wrapper pre mobilnú aplikáciu
 * Poskytuje čistú štruktúru: header + content + tab bar
 */
export function MobileApp({ children }: MobileAppProps) {
  return (
    <div className="mobile-app">
      {children}
    </div>
  );
}
