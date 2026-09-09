import { Signal, Execution, MarketBar } from './temporal-types.js';

export class LookAheadDetector {
    // Rule F: Temporal Isolation Check
    static assertExecutionBoundary(signal: Signal, execution: Execution, bar: MarketBar) {
        // 1. Information Time <= Generated At (Decision Time)
        if (signal.maxInformationAvailableAt > signal.generatedAt) {
            throw new Error(`HARD FAIL: Signal generated before its underlying information was available.`);
        }

        // 2. Generated At <= Executed At
        if (execution.executedAt <= signal.generatedAt) {
            throw new Error("HARD FAIL: Execution must occur strictly AFTER the signal is generated.");
        }
        
        // 3. Strict Interval Convention: [startTime, endTime)
        if (execution.executedAt < bar.startTime || execution.executedAt >= bar.endTime) {
            throw new Error(`HARD FAIL: Execution time ${execution.executedAt.toISOString()} falls outside the boundaries of the market bar [${bar.startTime.toISOString()}, ${bar.endTime.toISOString()}).`);
        }
        
        // 4. Data Validity
        if (bar.classification !== "VALID") {
            throw new Error(`HARD FAIL: Executed on a non-valid bar (Classification: ${bar.classification}).`);
        }
    }
}
