/**
 * Thin orchestrator for analysis sync & scoring.
 *
 * Originally an 878-line monolith, now split into:
 * - analysis/financialsSync.ts: syncFinancials (Finnhub XBRL)
 * - analysis/tickerDetailsSync.ts: syncTickerDetails + syncValuationHistory (Polygon API)
 * - analysis/scoreCalculator.ts: calculateScores (Altman Z, Piotroski, Beneish, AI verdict)
 */

export { syncFinancials } from './analysis/financialsSync';
export { syncTickerDetails, syncValuationHistory } from './analysis/tickerDetailsSync';
export { calculateScores } from './analysis/scoreCalculator';

import { syncTickerDetails } from './analysis/tickerDetailsSync';
import { syncFinancials } from './analysis/financialsSync';
import { syncValuationHistory } from './analysis/tickerDetailsSync';
import { calculateScores } from './analysis/scoreCalculator';

export class AnalysisService {
    static syncFinancials = syncFinancials;
    static syncTickerDetails = syncTickerDetails;
    static syncValuationHistory = syncValuationHistory;
    static calculateScores = calculateScores;

    /**
     * Complete synchronization and analysis for a single ticker.
     * Useful for batch processing and cron jobs.
     */
    static async syncAndAnalyze(symbol: string): Promise<boolean> {
        try {
            await this.syncTickerDetails(symbol);
            await this.syncFinancials(symbol);
            await this.syncValuationHistory(symbol);
            await this.calculateScores(symbol);
            return true;
        } catch (error) {
            console.error(`Error in syncAndAnalyze for ${symbol}:`, error);
            return false;
        }
    }
}
