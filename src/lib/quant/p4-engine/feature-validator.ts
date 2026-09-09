import { ValidatedFeature, FeatureAvailability, ImmutableFeatures } from './scoring-types.js';
import { InstantValidator } from './instant-validator.js';
import { Instant } from './temporal-types.js';

export class FeatureValidator {
    /**
     * P4.2-K & P4.2-L: Feature Contract Validator & Deep Freeze.
     */
    static validateAndFreeze<T extends number>(
        feature: ValidatedFeature<T>, 
        observationTime: Instant
    ): Readonly<ValidatedFeature<T>> {
        
        // 1. Validate Instant formats
        InstantValidator.assertCanonical(observationTime);
        if (feature.availability !== "MISSING" && feature.availability !== "NOT_APPLICABLE" && feature.availability !== "INSUFFICIENT_HISTORY") {
            InstantValidator.assertCanonical(feature.knownAt);
            
            // P4.2-B.1: PIT Validation
            if (feature.knownAt > observationTime) {
                throw new Error(`HARD FAIL: Feature ${feature.key} knownAt (${feature.knownAt}) > observationTime (${observationTime}).`);
            }
        }

        // 2. Validate Availability vs Value contract
        if (feature.availability === "AVAILABLE") {
            if (feature.value === null || feature.value === undefined) {
                throw new Error(`HARD FAIL: Feature ${feature.key} is marked AVAILABLE but value is null/undefined.`);
            }
            if (typeof feature.value === 'number') {
                if (Number.isNaN(feature.value)) {
                    throw new Error(`HARD FAIL: Feature ${feature.key} has NaN value.`);
                }
                if (!Number.isFinite(feature.value)) {
                    throw new Error(`HARD FAIL: Feature ${feature.key} has Infinity value.`);
                }
            }
            if (!feature.source) {
                throw new Error(`HARD FAIL: Feature ${feature.key} is AVAILABLE but missing provenance source.`);
            }
        } else {
            // MISSING, INVALID, INSUFFICIENT_HISTORY, NOT_APPLICABLE
            if (feature.value !== null) {
                throw new Error(`HARD FAIL: Feature ${feature.key} is ${feature.availability} but value is not null.`);
            }
        }

        if (feature.periodStart && feature.periodEnd) {
            InstantValidator.assertCanonical(feature.periodStart);
            InstantValidator.assertCanonical(feature.periodEnd);
            if (feature.periodStart > feature.periodEnd) {
                throw new Error(`HARD FAIL: Feature ${feature.key} periodStart > periodEnd.`);
            }
        }

        // Return a deeply frozen clone
        return Object.freeze({ ...feature });
    }

    static freezeFeatures(features: ImmutableFeatures, observationTime: Instant): Readonly<ImmutableFeatures> {
        return Object.freeze({
            epsSurprisePct: this.validateAndFreeze(features.epsSurprisePct, observationTime),
            revenueAccelerationPct: this.validateAndFreeze(features.revenueAccelerationPct, observationTime),
            marginExpansionBps: this.validateAndFreeze(features.marginExpansionBps, observationTime),
            estimateRevisionsPct: this.validateAndFreeze(features.estimateRevisionsPct, observationTime),
            priceStrengthPct: this.validateAndFreeze(features.priceStrengthPct, observationTime)
        });
    }
}
