'use client';

import React, { ReactNode, useState, useEffect } from 'react';

/**
 * KeepAliveTab — mounts children on first activation, then keeps them
 * mounted forever (display:none when inactive). Same pattern as the
 * mobile MobileScreen: preserves component state and avoids the
 * remount+refetch cost on every desktop tab switch (the heatmap alone
 * is ~600 tiles + treemap layout).
 */
export function KeepAliveTab({
  active,
  children,
  className = '',
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (!mounted && active) setMounted(true);
  }, [active, mounted]);

  if (!mounted) return null;
  return (
    <div className={className} style={active ? undefined : { display: 'none' }}>
      {children}
    </div>
  );
}
