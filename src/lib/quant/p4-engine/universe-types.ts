import { Instant } from './temporal-types.js';

export interface UniverseConfig {
    readonly minPrice: number;                 // e.g., $5.00
    readonly minMedianDollarVolume: number;    // e.g., $2,000,000
    readonly liquidityWindowDays: number;      // e.g., 20 days
    readonly minIpoAgeDays: number;            // e.g., 180 days
    readonly allowedAssetTypes: readonly string[]; // e.g., ["CS"] (Common Stock)
}

export type RejectionReason = 
    | "WRONG_ASSET_TYPE"
    | "NOT_YET_IPO"
    | "INSUFFICIENT_IPO_AGE"
    | "DELISTED"
    | "PRICE_TOO_LOW"
    | "ILLIQUID"
    | "NO_MARKET_DATA"
    | "NOT_TRADABLE_TODAY";

export interface UniverseCandidate {
    readonly cik: string;
    readonly ticker: string;
    readonly isEligible: boolean;
    readonly rejectionReason: RejectionReason | null;
    // Metadata strictly known at T
    readonly knownIpoDate: string;
    readonly priceAtT: number;
    readonly medianDollarVolume: number;
}
