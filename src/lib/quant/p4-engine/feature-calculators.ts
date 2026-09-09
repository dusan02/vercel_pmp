import { ValidatedFeature } from './scoring-types.js';
import { Instant } from './temporal-types.js';

export class FeatureCalculators {
    
    static calculateEpsSurprise(
        actual: number | null, 
        estimate: number | null, 
        knownAt: Instant,
        source: string
    ): ValidatedFeature<number> {
        if (estimate === null || actual === null) {
            return { key: "epsSurprisePct", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "MISSING" };
        }
        if (estimate === 0) {
            return { key: "epsSurprisePct", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INVALID" };
        }
        const value = ((actual - estimate) / Math.abs(estimate)) * 100;
        return { key: "epsSurprisePct", value, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: Number.isFinite(value) ? "AVAILABLE" : "INVALID" };
    }

    static calculateRevenueAcceleration(
        qCurrentGrowthPct: number | null, 
        qPriorGrowthPct: number | null,
        knownAt: Instant,
        source: string
    ): ValidatedFeature<number> {
        if (qCurrentGrowthPct === null || qPriorGrowthPct === null) {
            return { key: "revenueAccelerationPct", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INSUFFICIENT_HISTORY" };
        }
        const value = qCurrentGrowthPct - qPriorGrowthPct;
        return { key: "revenueAccelerationPct", value, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: Number.isFinite(value) ? "AVAILABLE" : "INVALID" };
    }

    static calculateMarginExpansion(
        currentMarginRatio: number | null, 
        priorMarginRatio: number | null,
        knownAt: Instant,
        source: string
    ): ValidatedFeature<number> {
        if (currentMarginRatio === null || priorMarginRatio === null) {
            return { key: "marginExpansionBps", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INSUFFICIENT_HISTORY" };
        }
        const bps = (currentMarginRatio - priorMarginRatio) * 10000;
        return { key: "marginExpansionBps", value: bps, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: Number.isFinite(bps) ? "AVAILABLE" : "INVALID" };
    }

    // P4.2-I: Estimate Revisions Calculator
    static calculateEstimateRevisions(
        currentEst: number | null,
        priorEst: number | null,
        currentKnownAt: Instant,
        priorKnownAt: Instant,
        source: string
    ): ValidatedFeature<number> {
        if (currentEst === null || priorEst === null) {
            return { key: "estimateRevisionsPct", value: null, knownAt: currentKnownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INSUFFICIENT_HISTORY" };
        }
        if (priorEst === 0) {
            return { key: "estimateRevisionsPct", value: null, knownAt: currentKnownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INVALID" };
        }
        
        // Ensure chronological consistency
        if (currentKnownAt < priorKnownAt) {
             return { key: "estimateRevisionsPct", value: null, knownAt: currentKnownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INVALID" };
        }

        const value = ((currentEst - priorEst) / Math.abs(priorEst)) * 100;
        return { key: "estimateRevisionsPct", value, knownAt: currentKnownAt, periodStart: null, periodEnd: null, source, accession: null, availability: Number.isFinite(value) ? "AVAILABLE" : "INVALID" };
    }

    // P4.2-J: Price Strength Calculator
    static calculatePriceStrength(
        priceAtT: number | null,
        priceAtTRef: number | null,
        benchmarkAtT: number | null,
        benchmarkAtTRef: number | null,
        knownAt: Instant,
        source: string
    ): ValidatedFeature<number> {
        if (priceAtT === null || priceAtTRef === null || benchmarkAtT === null || benchmarkAtTRef === null) {
            return { key: "priceStrengthPct", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INSUFFICIENT_HISTORY" };
        }
        if (priceAtTRef === 0 || benchmarkAtTRef === 0) {
            return { key: "priceStrengthPct", value: null, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: "INVALID" };
        }

        const stockReturn = ((priceAtT - priceAtTRef) / priceAtTRef) * 100;
        const benchReturn = ((benchmarkAtT - benchmarkAtTRef) / benchmarkAtTRef) * 100;
        const value = stockReturn - benchReturn;

        return { key: "priceStrengthPct", value, knownAt, periodStart: null, periodEnd: null, source, accession: null, availability: Number.isFinite(value) ? "AVAILABLE" : "INVALID" };
    }
}
