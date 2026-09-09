import { Instant } from './temporal-types.js';
import { ValidatedFeature, FeatureAvailability } from './scoring-types.js';

export interface FeatureEvidence {
    readonly feature: string;
    readonly value: number | null;
    readonly availability: FeatureAvailability;
    readonly observationTime: Instant;
    readonly knownAt: Instant;
    readonly source: string;
    readonly accession: string | null;
    readonly periodEnd: string | null;
    readonly formula: string;
    readonly inputs: ReadonlyArray<any>;
}

export interface ExtractedFeature<T> extends ValidatedFeature<T> {
    readonly evidence: FeatureEvidence;
}
