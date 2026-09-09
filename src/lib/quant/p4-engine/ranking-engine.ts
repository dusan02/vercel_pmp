import { ScoringInput, RankedResult } from './scoring-types.js';
import { EarlyWinnersScoringEngine } from './early-winners-scoring.js';

export class RankingEngine {
    static rankUniverse(inputs: ScoringInput[]): RankedResult[] {
        const engine = new EarlyWinnersScoringEngine();
        
        const scored = inputs.map(input => ({
            cik: input.cik,
            score: engine.calculateScore(input)
        }));

        // Tie-break policy: Score DESC, then CIK ASC deterministically
        scored.sort((a, b) => {
            if (a.score.total !== b.score.total) {
                return b.score.total - a.score.total; // DESC
            }
            return a.cik.localeCompare(b.cik); // ASC tie-breaker
        });

        return scored.map((s, index) => Object.freeze({
            cik: s.cik,
            score: s.score,
            rank: index + 1
        }));
    }
}
