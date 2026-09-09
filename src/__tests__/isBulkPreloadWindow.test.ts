import { describe, it, expect } from '@jest/globals';
import { isBulkPreloadWindow } from '@/lib/utils/marketWindowUtils';

describe('isBulkPreloadWindow', () => {
  // --- Inside window (expect true) ---
  it('returns true at 07:30 exactly (window start)', () => {
    expect(isBulkPreloadWindow(7, 30)).toBe(true);
  });

  it('returns true at 08:00', () => {
    expect(isBulkPreloadWindow(8, 0)).toBe(true);
  });

  it('returns true at 12:00 (mid-session)', () => {
    expect(isBulkPreloadWindow(12, 0)).toBe(true);
  });

  it('returns true at 14:59', () => {
    expect(isBulkPreloadWindow(14, 59)).toBe(true);
  });

  it('returns true at 15:00', () => {
    expect(isBulkPreloadWindow(15, 0)).toBe(true);
  });

  it('returns true at 15:54 (one minute before window end)', () => {
    expect(isBulkPreloadWindow(15, 54)).toBe(true);
  });

  // --- Outside window (expect false) ---
  it('returns false at 07:00 (before 07:30 — regression for old bug)', () => {
    expect(isBulkPreloadWindow(7, 0)).toBe(false);
  });

  it('returns false at 07:29 (one minute before window start)', () => {
    expect(isBulkPreloadWindow(7, 29)).toBe(false);
  });

  it('returns false at 15:55 (window end)', () => {
    expect(isBulkPreloadWindow(15, 55)).toBe(false);
  });

  it('returns false at 16:00 (after window)', () => {
    expect(isBulkPreloadWindow(16, 0)).toBe(false);
  });

  it('returns false at 00:00 (midnight)', () => {
    expect(isBulkPreloadWindow(0, 0)).toBe(false);
  });

  it('returns false at 04:00 (bootstrap time)', () => {
    expect(isBulkPreloadWindow(4, 0)).toBe(false);
  });

  it('returns false at 23:59 (end of day)', () => {
    expect(isBulkPreloadWindow(23, 59)).toBe(false);
  });
});
