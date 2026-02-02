'use client';

import React, { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { createPortal } from 'react-dom';

interface DropdownOption {
  value: string;
  label: string;
}

interface CustomDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  onChange,
  options,
  className = '',
  ariaLabel,
  placeholder
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find(opt => opt.value === value);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties | null>(null);

  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';

  const close = useMemo(() => () => setIsOpen(false), []);

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

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, close]);

  // When open, render menu in a portal (fixed positioning) so it can't be clipped by sticky containers.
  useLayoutEffect(() => {
    if (!isOpen) {
      setPortalStyle(null);
      return;
    }
    if (!canUseDOM) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const top = Math.round(rect.bottom + 6); // always open "down" from the trigger
      const rawWidth = Math.round(rect.width);
      const width = Math.min(rawWidth, window.innerWidth - 16);
      const left = Math.round(Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8));
      const maxHeight = Math.max(140, Math.min(320, window.innerHeight - top - 12));
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

    // Close on scroll OUTSIDE the menu (so users can scroll the menu itself).
    // Note: scroll events don't bubble, but they DO get captured. With `capture: true`,
    // this handler runs for scrolls in any scroll container (including the menu),
    // so we must ignore scrolls that originate inside the dropdown menu.
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

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    close();
  };

  // IMPORTANT: only render when portalStyle is known. Otherwise CSS "top: 100%" (relative to body)
  // makes the menu appear to come from the bottom of the screen.
  const menuEl = isOpen && portalStyle ? (
    <div
      ref={menuRef}
      className={`custom-dropdown-menu custom-dropdown-menu--portal`}
      role="listbox"
      style={{
        ...portalStyle,
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`custom-dropdown-option ${value === option.value ? 'selected' : ''}`}
          onClick={() => handleSelect(option.value)}
          role="option"
          aria-selected={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  ) : null;

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
        className="custom-dropdown-trigger w-full flex items-center justify-between px-3 py-2 bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 rounded-md"
        ref={triggerRef}
        onClick={() => setIsOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="custom-dropdown-value truncate mr-2">
          {selectedOption?.label || placeholder || 'Select...'}
        </span>
        <ChevronDown
          className={`custom-dropdown-arrow flex-shrink-0 ${isOpen ? 'open' : ''}`}
          size={16}
        />
      </button>

      {canUseDOM && menuEl ? createPortal(menuEl, document.body) : null}
    </div>
  );
};

