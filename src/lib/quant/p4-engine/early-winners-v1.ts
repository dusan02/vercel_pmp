import { TemporalSnapshot } from './temporal-snapshot.js';
import { StrategyDecision, EarlyWinnersStrategy } from './strategy-types.js';

export class EarlyWinnersStrategyV1 implements EarlyWinnersStrategy {
    /**
     * Deterministic, mock scoring algorithm strictly for proving pipeline integrity.
     * Generates a score (+18 / -13) purely based on point-in-time fundamentals.
     * No future data, no optimization.
     */
    evaluate(snapshot: TemporalSnapshot): StrategyDecision {
        if (snapshot.fundamentals.length === 0) {
            return { direction: 0, score: 0 };
        }

        // Trivial rule: if EPS > 1.0 -> Bullish (+18), else Bearish (-13)
        const epsFact = snapshot.fundamentals.find(f => f.metric === 'EPS');
        
        if (!epsFact) return { direction: 0, score: 0 };

        if (epsFact.value > 1.0) {
            return { direction: 1, score: 18 };
        } else {
            return { direction: -1, score: -13 };
        }
    }
}
