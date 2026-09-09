import { Signal, MarketBar, Execution, Instant } from './temporal-types.js';

export class ExecutionRouter {
    /**
     * Determines IF a specific target execution time is valid against the bar.
     */
    static route(signal: Signal, bar: MarketBar, targetExecutionTime: Instant): Execution {
        if (bar.classification === "DATA_MISSING") {
            throw new Error("HARD FAIL: Cannot execute on DATA_MISSING bar.");
        }
        if (bar.classification === "HALTED") {
            throw new Error("HARD FAIL: Cannot execute on HALTED bar.");
        }

        // Strict Chronological: execution > signal
        // If targetExecutionTime === signal.generatedAt, it fails.
        // E.g., if generated exactly at Open, execution happens infinitesimally after (in real life, the trade hits tape after signal).
        // To support "open" execution for "open" signal, we use >= for intraday bounding, but > for the actual information barrier.
        // Let's enforce target >= signal.generatedAt, but bar.endTime MUST be > generatedAt.
        if (targetExecutionTime < signal.generatedAt) {
            throw new Error(`HARD FAIL: Execution time (${targetExecutionTime}) must be strictly on or after Signal generation time (${signal.generatedAt}).`);
        }

        // Interval Check: [startTime, endTime)
        if (targetExecutionTime < bar.startTime) {
            throw new Error("HARD FAIL: Execution time is before the market bar started.");
        }
        if (targetExecutionTime >= bar.endTime) {
            throw new Error(`HARD FAIL: Execution time ${targetExecutionTime} is exactly on or after the market bar ended ${bar.endTime}.`);
        }

        const execution: Execution = {
            cik: signal.cik,
            executedAt: targetExecutionTime,
            fillPrice: bar.open
        };
        
        return Object.freeze(execution);
    }
}
