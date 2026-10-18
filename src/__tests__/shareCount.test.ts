import { isSuspiciousShareCount } from '../lib/utils/shareCount';

// Corruption signature: Finnhub XBRL EPS-fallback wrote netIncome/EPS where
// EPS came from a mismatched context — netIncome/shares lands on a small
// integer (PM rows stored shares = ni/1, ni/3, ni/5, ni/7).
describe('isSuspiciousShareCount', () => {
    const trusted = 1_559_000_000; // PM real share count

    it('flags ni/shares ≈ small integer with >15% deviation (PM Q1 2026 & GOOGL FY22/23)', () => {
        // PM stored 2.438B = netIncome/1 — real count 1.559B
        expect(isSuspiciousShareCount(2_438_000_000, 2_438_000_000, trusted)).toBe(true);
        // GOOGL FY23 stored 14.759B = 73.795B/5 — real count 12.23B (+20.7%)
        expect(isSuspiciousShareCount(14_759_000_000, 73_795_000_000, 12_229_934_831)).toBe(true);
        // GOOGL FY22 stored 14.993B = 59.972B/4 — real count 12.23B (+22.6%)
        expect(isSuspiciousShareCount(14_993_000_000, 59_972_000_000, 12_229_934_831)).toBe(true);
    });

    it('does NOT flag ni/7 when the derived count is ~correct (4% off)', () => {
        // Garbage EPS can still land near the real count — only flag when the
        // stored value is materially wrong (>30% from trusted).
        expect(isSuspiciousShareCount(1_621_142_857, 11_348_000_000, trusted)).toBe(false);
    });

    it('accepts a normal share count (EPS ≈ 7.28, not integer)', () => {
        expect(isSuspiciousShareCount(1_559_000_000, 11_348_000_000, trusted)).toBe(false);
    });

    it('accepts round-EPS when shares match the trusted count (no false positive)', () => {
        // EPS exactly 5.00 but count is correct → not corrupt
        expect(isSuspiciousShareCount(1_559_000_000, 7_795_000_000, trusted)).toBe(false);
    });

    it('cannot corroborate without a trusted count', () => {
        expect(isSuspiciousShareCount(2_438_000_000, 2_438_000_000, null)).toBe(false);
    });

    it('ignores null/invalid inputs', () => {
        expect(isSuspiciousShareCount(null, 1e9, trusted)).toBe(false);
        expect(isSuspiciousShareCount(1e9, null, trusted)).toBe(false);
        expect(isSuspiciousShareCount(1e9, 0, trusted)).toBe(false);
        expect(isSuspiciousShareCount(0, 1e9, trusted)).toBe(false);
    });
});
