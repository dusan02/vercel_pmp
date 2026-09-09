export interface StrategyDecision {
    readonly direction: 1 | -1 | 0;
    readonly score: number;
    // The strategy MUST NOT provide timestamps.
}

export interface EarlyWinnersStrategy {
    evaluate(snapshot: any): StrategyDecision;
}
