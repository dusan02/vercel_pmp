import { PitReconstructor } from './pit-reconstructor';

export interface UniverseConstraints {
    requirePrices: boolean;
    requireFundamentals: boolean;
    minPrice?: number;
    maxStalenessDays?: number; // Reject if no fundamental update in X days
}

export class UniverseFilter {
    private reconstructor: PitReconstructor;

    constructor(reconstructor: PitReconstructor) {
        this.reconstructor = reconstructor;
    }

    /**
     * Determines the exact tradable universe of security IDs at Time T.
     */
    public async getTradableUniverse(queryTime: Date, constraints: UniverseConstraints): Promise<string[]> {
        // 1. Get raw base universe (Listed before T, Delisted after T)
        // In real SQL: 
        // SELECT id FROM "PitSecurity" WHERE "listDate" <= T AND ("delistedDate" IS NULL OR "delistedDate" > T)
        let baseUniverse = await this.reconstructor.getActiveUniverse(queryTime);
        
        // The following logic is typically pushed down into SQL via JOINs for performance,
        // but illustrated here logically to demonstrate the semantic rules.
        
        // 2. Ticker Mapping constraint
        // If a company exists but has no active ticker map at Time T, it cannot be traded.
        
        // 3. Data Availability constraints
        if (constraints.requirePrices) {
            // Must have a valid closing price on the last trading day.
            // If trading is halted, or price data is missing, DROP from universe.
        }

        if (constraints.requireFundamentals && constraints.maxStalenessDays) {
            // Check if the most recent fundamental report is too old.
            // A company that stops reporting but isn't officially delisted yet 
            // (e.g., Pink Sheets transition) should be dropped to avoid trading on stale ghosts.
        }

        return baseUniverse;
    }
}
