'use client';

import React, { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  value: string | string[];
  onChange: (value: any) => void;
  options: DropdownOption[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  onChange,
  options,
  className = '',
  ariaLabel,
  placeholder,
  multiple = false,
  searchable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null);

  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

  // Normalize value to array for internal use
  const selectedValues: string[] = multiple
    ? (Array.isArray(value) ? value : [value])
    : (Array.isArray(value) ? value : [value]);

  const isSelected = useCallback((v: string) => selectedValues.includes(v), [selectedValues]);

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase().trim();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, search]);

  // Display label for the trigger button
  const displayLabel = useMemo(() => {
    if (multiple) {
      const arr = Array.isArray(value) ? value : [];
      if (arr.length === 0) return placeholder || 'Select...';
      if (arr.length === 1) {
        const opt = options.find(o => o.value === arr[0]);
        return opt?.label || arr[0];
      }
      return `${arr.length} selected`;
    }
    const opt = options.find(o => o.value === (value as string));
    return opt?.label || placeholder || 'Select...';
  }, [value, options, placeholder, multiple]);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIdx(-1);
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setSearch('');
    setHighlightIdx(-1);
  }, []);

  // Focus search input when menu opens
  useEffect(() => {
    if (isOpen && searchable) {
      // Small delay to ensure portal is rendered
      const id = setTimeout(() => searchRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [isOpen, searchable]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handlePointerDownOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideTrigger = dropdownRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) close();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handlePointerDownOutside);
      document.addEventListener('touchstart', handlePointerDownOutside, { passive: true });
    }

    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside as any);
    };
  }, [isOpen, close]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          close();
          triggerRef.current?.focus();
          break;
        case 'ArrowDown':
          event.preventDefault();
          setHighlightIdx(prev => {
            const next = prev < filteredOptions.length - 1 ? prev + 1 : 0;
            optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
            return next;
          });
          break;
        case 'ArrowUp':
          event.preventDefault();
          setHighlightIdx(prev => {
            const next = prev > 0 ? prev - 1 : filteredOptions.length - 1;
            optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
            return next;
          });
          break;
        case 'Enter':
          event.preventDefault();
          if (highlightIdx >= 0 && highlightIdx < filteredOptions.length && filteredOptions[highlightIdx]) {
            handleSelect(filteredOptions[highlightIdx].value);
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightIdx, filteredOptions, close]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIdx(filteredOptions.length > 0 ? 0 : -1);
  }, [search, filteredOptions.length]);

  // Portal positioning
  useLayoutEffect(() => {
    if (!isOpen) {
      setPortalStyle(null);
      return;
    }
    if (!canUseDOM) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.round(rect.bottom + 6);
      const rawWidth = Math.max(Math.round(rect.width), 220);
      const width = Math.min(rawWidth, window.innerWidth - 16);
      const left = Math.round(Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8));
      const maxHeight = Math.max(180, Math.min(380, window.innerHeight - top - 12));
      setPortalStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight,
        zIndex: 10000,
      });
    };

    updatePosition();

    const handleAnyScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && menuRef.current.contains(target)) return;
      close();
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleAnyScroll, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleAnyScroll, true);
    };
  }, [isOpen, canUseDOM, close]);

  const handleSelect = useCallback((optionValue: string) => {
    if (multiple) {
      const arr = Array.isArray(value) ? [...value] : [];
      const idx = arr.indexOf(optionValue);
      if (idx >= 0) {
        arr.splice(idx, 1);
      } else {
        arr.push(optionValue);
      }
      onChange(arr);
      // Don't close on multi-select
    } else {
      onChange(optionValue);
      close();
    }
  }, [multiple, value, onChange, close]);

  // Clear all selections (multi-select)
  const handleClearAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : 'all');
    close();
  }, [onChange, multiple, close]);

  const menuEl = isOpen && portalStyle ? (
    <div
      ref={menuRef}
      className="pmp-dropdown-menu custom-dropdown-menu--portal"
      role="listbox"
      aria-multiselectable={multiple}
      style={{
        ...portalStyle,
        WebkitOverflowScrolling: 'touch',
        overflowY: 'hidden',
        overscrollBehavior: 'contain',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Search input */}
      {searchable && (
        <div className="pmp-dropdown-search" style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.4,
                pointerEvents: 'none',
              }}
            />
            <input
              ref={searchRef}
              type="text"
              className="pmp-input w-full"
              style={{ paddingLeft: 28, fontSize: '0.8125rem', height: 32 }}
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              autoComplete="off"
            />
            {search && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSearch(''); searchRef.current?.focus(); }}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: 0.5,
                  padding: 2,
                  display: 'flex',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Options list */}
      <div
        style={{
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          flex: 1,
        }}
      >
        {filteredOptions.length === 0 ? (
          <div
            style={{
              padding: '12px 16px',
              opacity: 0.5,
              fontSize: '0.8125rem',
              textAlign: 'center',
            }}
          >
            No results
          </div>
        ) : (
          filteredOptions.map((option, idx) => {
            const selected = isSelected(option.value);
            const highlighted = idx === highlightIdx;
            return (
              <button
                key={option.value}
                type="button"
                ref={(el) => { optionRefs.current[idx] = el; }}
                className={`pmp-dropdown-option ${selected ? 'selected' : ''} ${highlighted ? 'highlighted' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: highlighted
                    ? 'var(--dropdown-highlight, rgba(59, 130, 246, 0.08))'
                    : undefined,
                }}
                onClick={() => handleSelect(option.value)}
                onMouseEnter={() => setHighlightIdx(idx)}
                role="option"
                aria-selected={selected}
              >
                {multiple && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: selected ? '2px solid rgb(59, 130, 246)' : '2px solid rgba(156, 163, 175, 0.5)',
                      backgroundColor: selected ? 'rgb(59, 130, 246)' : 'transparent',
                      flexShrink: 0,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {selected && <Check size={10} color="white" strokeWidth={3} />}
                  </span>
                )}
                <span style={{ flex: 1, textAlign: 'left' }}>{option.label}</span>
                {!multiple && selected && (
                  <Check size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Multi-select footer */}
      {multiple && (Array.isArray(value) ? value : []).length > 0 && (
        <div
          style={{
            padding: '6px 8px',
            borderTop: '1px solid var(--border-color, rgba(0,0,0,0.1))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            fontSize: '0.75rem',
          }}
        >
          <span style={{ opacity: 0.6 }}>
            {(Array.isArray(value) ? value : []).length} selected
          </span>
          <button
            type="button"
            onClick={handleClearAll}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgb(59, 130, 246)',
              fontWeight: 600,
              fontSize: '0.75rem',
              padding: '2px 6px',
            }}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  ) : null;

  // Determine if any non-default selection is active
  const hasSelection = multiple
    ? (Array.isArray(value) ? value : []).length > 0
    : value !== 'all' && value !== '';

  return (
    <div
      ref={dropdownRef}
      className={`custom-dropdown ${className} ${isOpen ? 'open' : ''}`}
      role="combobox"
      aria-expanded={isOpen}
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="pmp-input !pr-3 flex items-center justify-between"
        ref={triggerRef}
        onClick={() => isOpen ? close() : open()}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="custom-dropdown-value truncate mr-2">
          {displayLabel}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {hasSelection && !isOpen && (
            <button
              type="button"
              onClick={handleClearAll}
              className="flex items-center justify-center"
              style={{ padding: 2, opacity: 0.5 }}
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            className={`custom-dropdown-arrow ${isOpen ? 'open' : ''}`}
            size={16}
          />
        </div>
      </button>

      {canUseDOM && menuEl ? createPortal(menuEl, document.body) : null}
    </div>
  );
};

