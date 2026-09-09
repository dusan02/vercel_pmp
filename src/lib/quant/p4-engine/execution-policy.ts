import { Signal, Instant } from './temporal-types.js';
import { TradingSessionCalendar } from './trading-calendar.js';

export class ExecutionPolicy {
    static determineExecutionOpportunity(signal: Signal, calendar: TradingSessionCalendar): Instant {
        const session = calendar.getNextSession(signal.generatedAt);
        // If the signal arrived before market open, execute at Open.
        if (signal.generatedAt <= session.open) {
            return session.open;
        }
        // If intraday, we assume execution at next available tick (mocked here as generatedAt for the interval router to bound it)
        // In reality, strategy defines if it wants immediate, close, or next open.
        // For EarlyWinners standard policy, we just take the earliest legal moment.
        return signal.generatedAt;
    }
}
