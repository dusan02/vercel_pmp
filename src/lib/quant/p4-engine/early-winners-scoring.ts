import { ScoringInput, EarlyWinnerScore, ScoreComponent, ScoringEngineContract } from './scoring-types.js';
import { FeatureValidator } from './feature-validator.js';

export class EarlyWinnersScoringEngine implements ScoringEngineContract {
    
    calculateScore(rawInput: ScoringInput): EarlyWinnerScore {
        // Deep Freeze and Validate all features on entry (P4.2-K, L)
        const safeFeatures = FeatureValidator.freezeFeatures(rawInput.features, rawInput.observationTime);
        const input = Object.freeze({ ...rawInput, features: safeFeatures });

        const components: ScoreComponent[] = [];
        let total = 0;
        const f = input.features;

        // 1. Earnings Surprise (Threshold: > 10, < -10)
        if (f.epsSurprisePct.availability === "AVAILABLE" && f.epsSurprisePct.value !== null) {
            if (f.epsSurprisePct.value > 10) components.push({ name: "Earnings Surprise", points: 5, reason: `EPS beat by ${f.epsSurprisePct.value.toFixed(2)}%` });
            else if (f.epsSurprisePct.value < -10) components.push({ name: "Earnings Miss", points: -5, reason: `EPS missed by ${f.epsSurprisePct.value.toFixed(2)}%` });
        }

        // 2. Revenue Acceleration (Threshold: > 5, < -5)
        if (f.revenueAccelerationPct.availability === "AVAILABLE" && f.revenueAccelerationPct.value !== null) {
            if (f.revenueAccelerationPct.value > 5) components.push({ name: "Revenue Acceleration", points: 4, reason: `Revenue accelerated ${f.revenueAccelerationPct.value.toFixed(2)} pp` });
            else if (f.revenueAccelerationPct.value < -5) components.push({ name: "Revenue Deterioration", points: -3, reason: `Revenue decelerated ${f.revenueAccelerationPct.value.toFixed(2)} pp` });
        }

        // 3. Margin Expansion (Threshold: > 100, < -100 bps)
        if (f.marginExpansionBps.availability === "AVAILABLE" && f.marginExpansionBps.value !== null) {
            if (f.marginExpansionBps.value > 100) components.push({ name: "Margin Expansion", points: 3, reason: `Margins expanded by ${f.marginExpansionBps.value.toFixed(0)} bps` });
            else if (f.marginExpansionBps.value < -100) components.push({ name: "Margin Contraction", points: -2, reason: `Margins contracted by ${f.marginExpansionBps.value.toFixed(0)} bps` });
        }

        // 4. Estimate Revisions
        if (f.estimateRevisionsPct.availability === "AVAILABLE" && f.estimateRevisionsPct.value !== null) {
            if (f.estimateRevisionsPct.value > 2) components.push({ name: "Positive Revisions", points: 3, reason: `Estimates revised up ${f.estimateRevisionsPct.value.toFixed(2)}%` });
            else if (f.estimateRevisionsPct.value < -2) components.push({ name: "Negative Revisions", points: -2, reason: `Estimates revised down ${f.estimateRevisionsPct.value.toFixed(2)}%` });
        }

        // 5. Price Strength
        if (f.priceStrengthPct.availability === "AVAILABLE" && f.priceStrengthPct.value !== null) {
            if (f.priceStrengthPct.value > 10) components.push({ name: "Price Strength", points: 2, reason: `Prior relative strength ${f.priceStrengthPct.value.toFixed(2)}%` });
            else if (f.priceStrengthPct.value < -10) components.push({ name: "Price Weakness", points: -1, reason: `Prior relative weakness ${f.priceStrengthPct.value.toFixed(2)}%` });
        }

        for (const c of components) total += c.points;

        return Object.freeze({
            total,
            components: Object.freeze(components.map(c => Object.freeze({ ...c })))
        });
    }
}
