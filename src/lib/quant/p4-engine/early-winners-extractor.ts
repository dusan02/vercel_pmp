import { TemporalSnapshot } from './temporal-snapshot.js';
import { ImmutableFeatures } from './scoring-types.js';
import { ExtractedFeature, FeatureEvidence } from './feature-evidence.js';
import { Instant, PitFundamental } from './temporal-types.js';
import { FeatureValidator } from './feature-validator.js';
import { FeatureCalculators } from './feature-calculators.js';

export class EarlyWinnerFeatureExtractor {
    
    static extract(snapshot: TemporalSnapshot): ImmutableFeatures {
        return FeatureValidator.freezeFeatures({
            epsSurprisePct: this.extractEpsSurprise(snapshot),
            revenueAccelerationPct: this.extractRevenueAcceleration(snapshot),
            marginExpansionBps: this.extractMarginExpansion(snapshot),
            estimateRevisionsPct: this.extractEstimateRevisions(snapshot),
            priceStrengthPct: this.extractPriceStrength(snapshot)
        }, snapshot.observationTime);
    }

    private static findFact(snapshot: TemporalSnapshot, metric: string, periodEnd?: string): PitFundamental | undefined {
        const facts = snapshot.fundamentals.filter(f => f.metric === metric);
        if (periodEnd) return facts.find(f => f.economicPeriodEnd === periodEnd);
        return facts[0]; // Latest by periodEnd due to SQL ordering
    }

    private static getPriorYearQuarter(period: string): string {
        const d = new Date(period);
        d.setUTCFullYear(d.getUTCFullYear() - 1);
        return d.toISOString().split('T')[0];
    }
    
    private static getPriorQuarter(period: string): string {
        const d = new Date(period);
        d.setUTCMonth(d.getUTCMonth() - 3);
        // Normalize end of month (e.g. March 31 -> Dec 31)
        if (d.getUTCDate() < 28) {
            d.setUTCDate(0); // Move to end of previous month
        }
        return d.toISOString().split('T')[0];
    }

    // P4.3-R1: Correct Revenue Acceleration = Current YoY - Prior YoY
    private static extractRevenueAcceleration(snapshot: TemporalSnapshot): ExtractedFeature<number> {
        const curRev = this.findFact(snapshot, "Revenues");
        if (!curRev) return this.missing("revenueAccelerationPct", snapshot.observationTime, "No current revenue");

        const curPriorYr = this.getPriorYearQuarter(curRev.economicPeriodEnd);
        const curRevPriorYr = this.findFact(snapshot, "Revenues", curPriorYr);

        const priorQ = this.getPriorQuarter(curRev.economicPeriodEnd);
        const priorQRev = this.findFact(snapshot, "Revenues", priorQ);

        if (!curRevPriorYr || !priorQRev) return this.missing("revenueAccelerationPct", snapshot.observationTime, "Insufficient history for prior YoY");

        const priorQPriorYr = this.getPriorYearQuarter(priorQ);
        const priorQRevPriorYr = this.findFact(snapshot, "Revenues", priorQPriorYr);

        if (!priorQRevPriorYr) return this.missing("revenueAccelerationPct", snapshot.observationTime, "Insufficient history for Q-1 YoY");

        const curYoY = ((curRev.value - curRevPriorYr.value) / Math.abs(curRevPriorYr.value)) * 100;
        const priorYoY = ((priorQRev.value - priorQRevPriorYr.value) / Math.abs(priorQRevPriorYr.value)) * 100;
        const acceleration = curYoY - priorYoY;

        const latestKnown = curRev.acceptanceDateTime; // Assuming current is newest known

        return {
            key: "revenueAccelerationPct", value: acceleration, knownAt: latestKnown,
            periodStart: null, periodEnd: curRev.economicPeriodEnd,
            source: "SEC", accession: curRev.accessionNumber, availability: "AVAILABLE",
            evidence: {
                feature: "revenueAccelerationPct", value: acceleration, availability: "AVAILABLE",
                observationTime: snapshot.observationTime, knownAt: latestKnown,
                source: "SEC", accession: curRev.accessionNumber, periodEnd: curRev.economicPeriodEnd,
                formula: "Current YoY - Prior YoY",
                inputs: [{ curYoY, priorYoY, curRev: curRev.value, curRevPriorYr: curRevPriorYr.value }]
            }
        };
    }

    private static extractMarginExpansion(snapshot: TemporalSnapshot): ExtractedFeature<number> {
        const curRev = this.findFact(snapshot, "Revenues");
        const curOp = this.findFact(snapshot, "OperatingIncomeLoss");
        if (!curRev || !curOp) return this.missing("marginExpansionBps", snapshot.observationTime, "Missing Rev or OpInc");
        if (curRev.value <= 0) return this.missing("marginExpansionBps", snapshot.observationTime, "Revenue <= 0", "INVALID");

        const priorQEnd = this.getPriorYearQuarter(curRev.economicPeriodEnd);
        const priorRev = this.findFact(snapshot, "Revenues", priorQEnd);
        const priorOp = this.findFact(snapshot, "OperatingIncomeLoss", priorQEnd);

        if (!priorRev || !priorOp) return this.missing("marginExpansionBps", snapshot.observationTime, "Missing prior comparable");
        if (priorRev.value <= 0) return this.missing("marginExpansionBps", snapshot.observationTime, "Prior Revenue <= 0", "INVALID");

        const curMargin = curOp.value / curRev.value;
        const priorMargin = priorOp.value / priorRev.value;
        const bps = (curMargin - priorMargin) * 10000;
        const latestKnownAt = curOp.acceptanceDateTime > curRev.acceptanceDateTime ? curOp.acceptanceDateTime : curRev.acceptanceDateTime;

        return {
            key: "marginExpansionBps", value: bps, knownAt: latestKnownAt,
            periodStart: null, periodEnd: curRev.economicPeriodEnd,
            source: "SEC", accession: curOp.accessionNumber, availability: "AVAILABLE",
            evidence: {
                feature: "marginExpansionBps", value: bps, availability: "AVAILABLE",
                observationTime: snapshot.observationTime, knownAt: latestKnownAt,
                source: "SEC", accession: curOp.accessionNumber, periodEnd: curRev.economicPeriodEnd,
                formula: "((curOp/curRev) - (priorOp/priorRev)) * 10000",
                inputs: [{ curMargin, priorMargin }]
            }
        };
    }

    // P4.3-R2: Real EPS Surprise (Actual vs Consensus)
    private static extractEpsSurprise(snapshot: TemporalSnapshot): ExtractedFeature<number> {
        const actual = this.findFact(snapshot, "EarningsPerShareBasic");
        if (!actual) return this.missing("epsSurprisePct", snapshot.observationTime, "No actual EPS");

        // The snapshot estimates array is ordered by knownAt DESC. We take the latest one.
        const latestEst = snapshot.estimates[0];
        if (!latestEst) return this.missing("epsSurprisePct", snapshot.observationTime, "No consensus estimate");
        if (latestEst.consensusValue === 0) return this.missing("epsSurprisePct", snapshot.observationTime, "Estimate is zero", "INVALID");

        const val = ((actual.value - latestEst.consensusValue) / Math.abs(latestEst.consensusValue)) * 100;
        const latestKnown = actual.acceptanceDateTime > latestEst.knownAt ? actual.acceptanceDateTime : latestEst.knownAt;

        return {
            key: "epsSurprisePct", value: val, knownAt: latestKnown,
            periodStart: null, periodEnd: actual.economicPeriodEnd,
            source: "SEC_AND_CONSENSUS", accession: actual.accessionNumber, availability: "AVAILABLE",
            evidence: {
                feature: "epsSurprisePct", value: val, availability: "AVAILABLE",
                observationTime: snapshot.observationTime, knownAt: latestKnown,
                source: "SEC_AND_CONSENSUS", accession: actual.accessionNumber, periodEnd: actual.economicPeriodEnd,
                formula: "(actual - estimate) / abs(estimate)",
                inputs: [{ actual: actual.value, estimate: latestEst.consensusValue }]
            }
        };
    }

    // P4.3-R3: Real Estimate Revisions (T0 vs T1)
    private static extractEstimateRevisions(snapshot: TemporalSnapshot): ExtractedFeature<number> {
        if (snapshot.estimates.length < 2) return this.missing("estimateRevisionsPct", snapshot.observationTime, "Insufficient estimate history");
        
        // snapshot.estimates is ordered by knownAt DESC.
        // T1 is the latest known estimate. T0 is the one before it.
        const currentEst = snapshot.estimates[0];
        const priorEst = snapshot.estimates[1];

        if (priorEst.consensusValue === 0) return this.missing("estimateRevisionsPct", snapshot.observationTime, "Prior estimate zero", "INVALID");

        const val = ((currentEst.consensusValue - priorEst.consensusValue) / Math.abs(priorEst.consensusValue)) * 100;
        
        return {
            key: "estimateRevisionsPct", value: val, knownAt: currentEst.knownAt,
            periodStart: null, periodEnd: currentEst.fiscalPeriod,
            source: "CONSENSUS", accession: null, availability: "AVAILABLE",
            evidence: {
                feature: "estimateRevisionsPct", value: val, availability: "AVAILABLE",
                observationTime: snapshot.observationTime, knownAt: currentEst.knownAt,
                source: "CONSENSUS", accession: null, periodEnd: currentEst.fiscalPeriod,
                formula: "(currentEst - priorEst) / abs(priorEst)",
                inputs: [{ currentEst: currentEst.consensusValue, priorEst: priorEst.consensusValue, T1: currentEst.knownAt, T0: priorEst.knownAt }]
            }
        };
    }

    // P4.3-R4: Real Price Strength
    private static extractPriceStrength(snapshot: TemporalSnapshot): ExtractedFeature<number> {
        if (snapshot.marketBars.length < 2 || snapshot.benchmarkBars.length < 2) {
            return this.missing("priceStrengthPct", snapshot.observationTime, "Missing market bars");
        }

        // Ordered by date DESC. Latest is index 0. Oldest is length - 1.
        const stockT1 = snapshot.marketBars[0];
        const stockT0 = snapshot.marketBars[snapshot.marketBars.length - 1];

        const benchT1 = snapshot.benchmarkBars[0];
        const benchT0 = snapshot.benchmarkBars[snapshot.benchmarkBars.length - 1];

        if (stockT0.close === 0 || benchT0.close === 0) return this.missing("priceStrengthPct", snapshot.observationTime, "Zero reference price", "INVALID");

        const stockReturn = ((stockT1.close - stockT0.close) / stockT0.close) * 100;
        const benchReturn = ((benchT1.close - benchT0.close) / benchT0.close) * 100;
        const relativeStrength = stockReturn - benchReturn;

        const knownAt = snapshot.observationTime; // The latest bar determines info bounds

        return {
            key: "priceStrengthPct", value: relativeStrength, knownAt,
            periodStart: stockT0.date, periodEnd: stockT1.date,
            source: "POLYGON", accession: null, availability: "AVAILABLE",
            evidence: {
                feature: "priceStrengthPct", value: relativeStrength, availability: "AVAILABLE",
                observationTime: snapshot.observationTime, knownAt,
                source: "POLYGON", accession: null, periodEnd: stockT1.date,
                formula: "stockReturn - benchReturn",
                inputs: [{ stockReturn, benchReturn, stockT1: stockT1.close, stockT0: stockT0.close, benchT1: benchT1.close, benchT0: benchT0.close }]
            }
        };
    }

    private static missing(key: string, obs: Instant, reason: string, avail: any = "MISSING"): ExtractedFeature<any> {
        return {
            key, value: null, knownAt: obs, periodStart: null, periodEnd: null,
            source: "N/A", accession: null, availability: avail,
            evidence: {
                feature: key, value: null, availability: avail, observationTime: obs,
                knownAt: obs, source: "N/A", accession: null, periodEnd: null,
                formula: "N/A", inputs: [{ reason }]
            }
        };
    }
}
