import { UniverseConfig, UniverseCandidate, RejectionReason } from './universe-types.js';
import { Instant, MarketBar } from './temporal-types.js';

export interface CompanyReferenceData {
    readonly cik: string;
    readonly ticker: string;
    readonly assetType: string; // "CS", "ADR", "ETF", "SPAC"
    readonly ipoDate: string;   // YYYY-MM-DD
    readonly delistingDate: string | null; // YYYY-MM-DD
}

export class HistoricalUniverseBuilder {
    
    constructor(private config: UniverseConfig) {}

    public evaluateCandidate(
        targetInstant: Instant,
        company: CompanyReferenceData,
        recentBars: MarketBar[], // Must be sorted descending (index 0 is latest)
        todayBar: MarketBar | undefined // Bar specifically for targetInstant trading day
    ): UniverseCandidate {
        
        const observationDate = targetInstant.split('T')[0];
        
        const reject = (reason: RejectionReason, price = 0, vol = 0): UniverseCandidate => ({
            cik: company.cik, ticker: company.ticker, isEligible: false, rejectionReason: reason,
            knownIpoDate: company.ipoDate, priceAtT: price, medianDollarVolume: vol
        });

        // 1 & 10. Asset Class & Identity Classification
        if (!this.config.allowedAssetTypes.includes(company.assetType)) {
            return reject("WRONG_ASSET_TYPE");
        }

        // 2 & 7. IPO Age & PIT Eligibility
        if (company.ipoDate > observationDate) {
            return reject("NOT_YET_IPO");
        }
        
        const ipoTime = new Date(company.ipoDate).getTime();
        const obsTime = new Date(observationDate).getTime();
        const ageDays = (obsTime - ipoTime) / (1000 * 60 * 60 * 24);
        if (ageDays < this.config.minIpoAgeDays) {
            return reject("INSUFFICIENT_IPO_AGE");
        }

        // 3. Survivorship / Delistings
        // Note: company.delistingDate must conceptually be known at T. If it's a future delisting, 
        // it wouldn't be rejected yet, which is CORRECT for survivorship bias prevention.
        if (company.delistingDate && company.delistingDate <= observationDate) {
            return reject("DELISTED");
        }

        // 6. Trading Availability
        if (!todayBar || todayBar.volume === 0 || todayBar.classification !== "VALID") {
            return reject("NOT_TRADABLE_TODAY");
        }

        // Calculate Liquidity metrics
        if (recentBars.length === 0) {
            return reject("NO_MARKET_DATA", todayBar.close, 0);
        }

        // 5. Price Floor
        if (todayBar.close < this.config.minPrice) {
            return reject("PRICE_TOO_LOW", todayBar.close, 0);
        }

        // 4 & 8. Liquidity & Corporate Actions (Assume bars are split-adjusted)
        // Median Dollar Volume calculation
        const dollarVolumes = recentBars.map(b => b.close * b.volume).sort((a, b) => a - b);
        let medianDv = 0;
        if (dollarVolumes.length > 0) {
            const mid = Math.floor(dollarVolumes.length / 2);
            medianDv = dollarVolumes.length % 2 !== 0 ? dollarVolumes[mid] : (dollarVolumes[mid - 1] + dollarVolumes[mid]) / 2;
        }

        if (medianDv < this.config.minMedianDollarVolume) {
            return reject("ILLIQUID", todayBar.close, medianDv);
        }

        // Passed all gates
        return {
            cik: company.cik,
            ticker: company.ticker,
            isEligible: true,
            rejectionReason: null,
            knownIpoDate: company.ipoDate,
            priceAtT: todayBar.close,
            medianDollarVolume: medianDv
        };
    }
}
