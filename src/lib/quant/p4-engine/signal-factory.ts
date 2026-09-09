import { TemporalSnapshot } from './temporal-snapshot.js';
import { Signal, Instant } from './temporal-types.js';
import { StrategyDecision } from './strategy-types.js';

export class SignalFactory {
    static create(snapshot: TemporalSnapshot, decision: StrategyDecision): Signal {
        const signal: Signal = {
            cik: snapshot.cik,
            generatedAt: snapshot.observationTime,
            maxInformationAvailableAt: snapshot.maxInformationAvailableAt,
            direction: decision.direction,
            score: decision.score
        };
        return Object.freeze(signal);
    }
}
