export interface SecFactDNA {
    readonly cik: string;
    readonly accessionNumber: string;
    readonly form: string;
    readonly filingDate: string;
    readonly acceptedAt: string;
    readonly period: string;
    readonly fact: string;
    readonly unit: string;
    readonly value: number;
    readonly version: number;
    readonly knownAt: string;
}

export class DataValidator {
    
    public static validateKnownAt(fact: SecFactDNA) {
        // P4.12 Invariant: knownAt must be >= acceptedAt (source availability time)
        // Inferring knownAt purely from filingDate (e.g., 00:00:00) introduces leakage
        if (fact.knownAt < fact.acceptedAt) {
            throw new Error(`DATA FATAL: knownAt (${fact.knownAt}) cannot precede acceptedAt (${fact.acceptedAt}). Leakage risk.`);
        }
    }

    public static validatePriceCrossCheck(rawUnadjusted: number, ourSplitFactor: number, polygonAdjusted: number) {
        // P4.12 Invariant: Polygon Adjusted cross-check ONLY tests split adjustments, NOT dividends.
        const ourAdjusted = rawUnadjusted * ourSplitFactor;
        
        const absDiff = Math.abs(ourAdjusted - polygonAdjusted);
        const relDiff = polygonAdjusted > 0 ? absDiff / polygonAdjusted : 0;
        
        const ABS_TOLERANCE = 0.01;
        const REL_TOLERANCE = 0.005; // 0.5%
        
        if (absDiff > ABS_TOLERANCE && relDiff > REL_TOLERANCE) {
            throw new Error(`DATA FAIL: Unexplained split-adjustment mismatch. Expected ~${polygonAdjusted}, got ${ourAdjusted}. Investigation required.`);
        }
    }

    public static validateMarketGap(date: string, hasBar: boolean, isHoliday: boolean, ipoDate: string, delistingDate: string | null) {
        // P4.12 Invariant: Missing bar != Critical Gap. Must check IPO, Delisting, Holidays.
        if (date < ipoDate) return; // Not yet trading
        if (delistingDate && date > delistingDate) return; // Dead
        if (isHoliday) return; // Market Closed
        
        if (!hasBar) {
            throw new Error(`DATA FATAL: Critical market-data gap on ${date}. Security is active, market is open, no halt documented.`);
        }
    }
}
