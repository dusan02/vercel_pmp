/**
 * EarlyWinner Engine — PIT Gate
 * ==============================
 *
 * Validates that all features used in scoring were knowable at asOfTime.
 * FAILS CLOSED: any violation → pitGatePassed = false → score excluded.
 *
 * Rules:
 *   1. feature.knownAt <= asOfTime
 *   2. feature.availableAt <= asOfTime
 *   3. feature.pitValid === true
 *   4. feature.availability !== 'INVALID' (invalid features can't be used)
 */

import { EwFeature, PitGateResult, PitViolation } from './types.js';

export class PitGate {
  validate(features: EwFeature[], asOfTime: string): PitGateResult {
    const violations: PitViolation[] = [];
    const asOf = new Date(asOfTime).getTime();

    for (const f of features) {
      // Skip missing/blocked features — they don't contribute to score
      if (f.value === null) continue;

      // Rule 1: knownAt <= asOfTime
      const knownAt = new Date(f.knownAt).getTime();
      if (knownAt > asOf) {
        violations.push({
          featureKey: f.key,
          violation: 'KNOWN_AT_FUTURE',
          detail: `knownAt=${f.knownAt} > asOfTime=${asOfTime}`,
        });
      }

      // Rule 2: availableAt <= asOfTime
      const availableAt = new Date(f.availableAt).getTime();
      if (availableAt > asOf) {
        violations.push({
          featureKey: f.key,
          violation: 'AVAILABLE_AT_FUTURE',
          detail: `availableAt=${f.availableAt} > asOfTime=${asOfTime}`,
        });
      }

      // Rule 3: pitValid must be true
      if (!f.pitValid) {
        violations.push({
          featureKey: f.key,
          violation: 'PIT_INVALID',
          detail: `feature.pitValid=false for ${f.key}`,
        });
      }

      // Rule 4: availability must not be INVALID
      if (f.availability === 'INVALID') {
        violations.push({
          featureKey: f.key,
          violation: 'INVALID_AVAILABILITY',
          detail: `feature.availability=INVALID for ${f.key}`,
        });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
    };
  }
}
