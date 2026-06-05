'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { CompanyNode } from '@/lib/heatmap/types';
import { formatPrice, formatPercent, formatMarketCap, formatMarketCapDiff } from '@/lib/utils/format';
import CompanyLogo from '../CompanyLogo';

interface MobileHeatmapSheetProps {
  company: CompanyNode;
  onClose: () => void;
  onToggleFavorite?: ((ticker: string) => void) | undefined;
  isFavorite?: ((ticker: string) => boolean) | undefined;
  onNavigateToAnalysis?: ((company: CompanyNode) => void) | undefined;
}

/**
 * Bottom sheet showing company details after tapping a tile.
 * - Slides up on open, slides down on close (framer-motion)
 * - Drag-to-dismiss via the handle bar
 * - Shows company name, sector, price, % change, market cap
 * - "View Analysis" CTA when onNavigateToAnalysis is provided
 */
export const MobileHeatmapSheet: React.FC<MobileHeatmapSheetProps> = ({
  company,
  onClose,
  onToggleFavorite,
  isFavorite,
  onNavigateToAnalysis,
}) => {
  const isFav = isFavorite?.(company.symbol) ?? false;

  // Drag-to-dismiss: track touch delta on the handle strip only
  const dragStartY = useRef(0);
  const [handleDragY, setHandleDragY] = useState(0);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    dragStartY.current = e.touches[0].clientY;
    setHandleDragY(0);
  }, []);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!e.touches[0]) return;
    const delta = Math.max(0, e.touches[0].clientY - dragStartY.current);
    setHandleDragY(delta);
  }, []);

  const onHandleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!e.changedTouches[0]) return;
    const delta = e.changedTouches[0].clientY - dragStartY.current;
    if (delta > 80) {
      onClose();
    } else {
      setHandleDragY(0);
    }
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="fixed inset-0"
        style={{
          background: 'rgba(0,0,0,0.6)',
          zIndex: 9998,
          bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: 'none',
          cursor: 'default',
        }}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: handleDragY > 0 ? handleDragY : 0 }}
        exit={{ y: '100%' }}
        transition={
          handleDragY > 0
            ? { type: 'tween', duration: 0 }
            : { type: 'spring', stiffness: 350, damping: 32 }
        }
        className="fixed inset-x-0"
        style={{
          zIndex: 10000,
          background: 'linear-gradient(180deg, rgba(18,18,22,0.98) 0%, rgba(12,12,16,1) 100%)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          color: '#fff',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.7), 0 -1px 0 rgba(255,255,255,0.08)',
          padding: 0,
          maxHeight: 'calc(100dvh - 48px - var(--tabbar-real-h, var(--tabbar-h, 72px)))',
          overflow: 'auto',
          bottom: 'var(--tabbar-real-h, var(--tabbar-h, 72px))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Drag handle — touch events only on this strip */}
        <div
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
          style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{
            width: 36, height: 4, borderRadius: 2,
            background: handleDragY > 40 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
            transition: 'background 0.15s',
          }} />
        </div>

        {/* Header row */}
        <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
            <div style={{ flexShrink: 0 }}>
              <CompanyLogo ticker={company.symbol} size={44} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                {company.symbol}
              </div>
              {company.name && company.name !== company.symbol && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {company.name}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, marginTop: 1 }}>
                {company.sector && <span>{company.sector}</span>}
                {company.sector && company.industry && company.industry !== company.sector && (
                  <>
                    <span style={{ margin: '0 4px', opacity: 0.4 }}>·</span>
                    <span>{company.industry}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(company.symbol)}
                style={{
                  width: 38, height: 38, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, border: 'none', cursor: 'pointer',
                  transition: 'background 0.15s',
                  background: isFav ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.08)',
                  color: isFav ? '#fbbf24' : 'rgba(255,255,255,0.6)',
                  WebkitTapHighlightColor: 'transparent',
                }}
                aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFav ? '★' : '☆'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 38, height: 38, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.7)',
                WebkitTapHighlightColor: 'transparent',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Data Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px',
          margin: '12px 16px',
          background: 'rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <DataCell label="Price" value={company.currentPrice ? `$${formatPrice(company.currentPrice)}` : '—'} large />
          <DataCell
            label="% Change"
            value={formatPercent(company.changePercent ?? 0)}
            color={(company.changePercent ?? 0) >= 0 ? '#34d399' : '#f87171'}
            large
          />
          <DataCell label="Market Cap" value={formatMarketCap(company.marketCap ?? 0)} />
          <DataCell
            label="Mcap Δ"
            value={company.marketCapDiff == null ? '—' : formatMarketCapDiff(company.marketCapDiff)}
            color={(company.marketCapDiff ?? 0) >= 0 ? '#34d399' : '#f87171'}
          />
        </div>

        {/* View Analysis CTA */}
        {onNavigateToAnalysis && (
          <div style={{ padding: '0 16px 20px' }}>
            <button
              type="button"
              onClick={() => { onNavigateToAnalysis(company); onClose(); }}
              style={{
                width: '100%', padding: '13px 16px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#fff', fontWeight: 700, fontSize: 15,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: '0 4px 16px rgba(37,99,235,0.35)',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              View Analysis <span style={{ fontSize: 16 }}>→</span>
            </button>
          </div>
        )}
      </motion.div>
    </>
  );
};

// Small helper to keep grid cells DRY
function DataCell({ label, value, color, large }: {
  label: string; value: string; color?: string; large?: boolean;
}) {
  return (
    <div style={{ padding: '12px 14px', background: large ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)' }}>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{
        fontSize: large ? 18 : 15,
        fontWeight: large ? 700 : 600,
        color: color ?? (large ? '#fff' : '#e5e7eb'),
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}
