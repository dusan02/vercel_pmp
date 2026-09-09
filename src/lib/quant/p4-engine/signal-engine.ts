import { SignalConfig, Signal, SignalDirection } from './signal-types.js';
import { InstantValidator } from './instant-validator.js';
import { Instant } from './temporal-types.js';
import { UniverseCandidate } from './universe-types.js';
import { TemporalSnapshot } from './temporal-snapshot.js';
import { ImmutableFeatures } from './scoring-types.js';
import { EarlyWinnerScore } from './scoring-types.js';

export class SignalEngine {
    constructor(private config: SignalConfig) {}

    public generateSignal(
        candidate: UniverseCandidate,
        snapshot: TemporalSnapshot,
        features: ImmutableFeatures,
        score: EarlyWinnerScore,
        generatedAt: Instant
    ): Readonly<Signal> {
        
        // 1. Temporal Invariants Validation (HARD FAIL if violated)
        InstantValidator.assertCanonical(generatedAt);
        if (snapshot.observationTime > generatedAt) {
            throw new Error(`HARD FAIL: observationTime (${snapshot.observationTime}) > generatedAt (${generatedAt})`);
        }
        if (snapshot.maxInformationAvailableAt > generatedAt) {
            throw new Error(`HARD FAIL: maxInformationAvailableAt (${snapshot.maxInformationAvailableAt}) > generatedAt (${generatedAt})`);
        }
        
        // 2. Universe Eligibility Check
        if (!candidate.isEligible) {
            return this.buildSignal(candidate, snapshot, features, score, generatedAt, "HOLD", `Universe Rejection: ${candidate.rejectionReason}`, "00000");
        }

        // 3. Availability Mask Generation
        const epsAvail = features.epsSurprisePct.availability === "AVAILABLE";
        const revAvail = features.revenueAccelerationPct.availability === "AVAILABLE";
        const marAvail = features.marginExpansionBps.availability === "AVAILABLE";
        const estAvail = features.estimateRevisionsPct.availability === "AVAILABLE";
        const prcAvail = features.priceStrengthPct.availability === "AVAILABLE";
        
        const mask = [epsAvail, revAvail, marAvail, estAvail, prcAvail]
            .map(a => a ? "1" : "0").join("");

        const availableCount = mask.split("").filter(c => c === "1").length;

        // 4. Missing feature explicitly blocks if it violates config
        if (this.config.requireEps && !epsAvail) {
            return this.buildSignal(candidate, snapshot, features, score, generatedAt, "HOLD", `EPS Surprise is MISSING. (Mask: ${mask})`, mask);
        }
        if (availableCount < this.config.minAvailableFeatures) {
            return this.buildSignal(candidate, snapshot, features, score, generatedAt, "HOLD", `Insufficient data: ${availableCount}/${mask.length} available.`, mask);
        }

        // 5. Threshold Evaluation
        let direction: SignalDirection = "HOLD";
        let reason = `Score ${score.total} is between SELL (${this.config.sellThreshold}) and BUY (${this.config.buyThreshold})`;

        if (score.total >= this.config.buyThreshold) {
            direction = "BUY";
            reason = `Score ${score.total} >= BUY threshold (${this.config.buyThreshold})`;
        } else if (score.total <= this.config.sellThreshold) {
            direction = "SELL";
            reason = `Score ${score.total} <= SELL threshold (${this.config.sellThreshold})`;
        }

        return this.buildSignal(candidate, snapshot, features, score, generatedAt, direction, reason, mask);
    }

    private buildSignal(
        candidate: UniverseCandidate,
        snapshot: TemporalSnapshot,
        features: ImmutableFeatures,
        score: EarlyWinnerScore,
        generatedAt: Instant,
        direction: SignalDirection,
        decisionReason: string,
        mask: string
    ): Readonly<Signal> {
        
        const featureValues = {
            epsSurprisePct: features.epsSurprisePct.value,
            revenueAccelerationPct: features.revenueAccelerationPct.value,
            marginExpansionBps: features.marginExpansionBps.value,
            estimateRevisionsPct: features.estimateRevisionsPct.value,
            priceStrengthPct: features.priceStrengthPct.value
        };

        const signal: Signal = {
            cik: candidate.cik,
            ticker: candidate.ticker,
            observationTime: snapshot.observationTime,
            generatedAt,
            maxInformationAvailableAt: snapshot.maxInformationAvailableAt,
            universeDecision: candidate.isEligible ? "ELIGIBLE" : "REJECTED",
            availabilityMask: mask,
            featureValues: Object.freeze(featureValues),
            score: score.total,
            scoreVersion: "P4.2-v1",
            thresholdVersion: this.config.version,
            direction,
            decisionReason
        };

        return Object.freeze(signal);
    }
}
