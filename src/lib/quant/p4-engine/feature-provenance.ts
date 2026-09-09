import { ValidatedFeature, FeatureAvailability } from './scoring-types.js';
import { Instant } from './temporal-types.js';

export class FeatureProvenance {
    /**
     * P4.2-B.1: PIT Validator
     * Strictly asserts that the feature's knownAt is <= observationTime.
     */
    static assertKnownAt(feature: ValidatedFeature<any>, observationTime: Instant) {
        // If missing or invalid, we don't have a known time to violate.
        if (feature.availability !== "AVAILABLE") return;

        if (feature.knownAt > observationTime) {
            throw new Error(`HARD FAIL: Feature ${feature.key} has provenance knownAt (${feature.knownAt}) greater than observationTime (${observationTime}). Future leak detected.`);
        }
    }
}
