/**
 * CorporateActionAdjuster
 *
 * Adjusts historical prices for corporate actions (splits, dividends).
 *
 * PIT principle: When querying as-of date T, we must use the adjustment
 * factors that were KNOWN at T. A split announced after T must NOT affect
 * prices before T.
 *
 * However, for backtesting we typically use "adjusted prices" that account
 * for all splits/dividends up to the query date. This is PIT-correct because:
 * - The split ratio is known at the ex-date
 * - Adjusting historical prices by known splits doesn't use future info
 * - The adjustment factor is computed from actions with exDate <= queryDate
 *
 * Adjustment methodology:
 * - Splits: Multiply pre-split prices by (splitFrom / splitTo).
 *   E.g., 4-for-1 split: pre-split prices are divided by 4 (or multiplied by 1/4).
 *   The splitFactor stored in PitCorporateAction is splitTo/splitFrom (e.g., 4.0 for 4-for-1).
 *   To adjust pre-split prices, we divide by splitFactor (i.e., multiply by splitFrom/splitTo).
 *
 * - Dividends: Adjust pre-ex-date prices by (1 - dividend/closeOnExDate).
 *   This is the standard "adjusted close" methodology used by Yahoo Finance, Polygon, etc.
 *   For simplicity and to avoid circular dependency (we need close on ex-date to compute
 *   the dividend adjustment), we use the approximation:
 *   adjustmentFactor *= (closeOnExDate - dividendAmount) / closeOnExDate
 *
 * The cumulative adjustment factor is applied to all OHLC prices before the action's ex-date.
 */

export interface RawPrice {
    open: number;
    high: number;
    low: number;
    close: number;
}

export interface CorporateActionInput {
    type: 'SPLIT' | 'DIVIDEND';
    effectiveDate: Date;
    splitFactor?: number | null;
    dividendAmount?: number | null;
}

export interface AdjustedPrice extends RawPrice {
    adjustmentFactor: number;
}

export class CorporateActionAdjuster {

    /**
     * Computes the cumulative adjustment factor for a given trade date,
     * considering all corporate actions with effectiveDate > tradeDate
     * (i.e., actions that occurred AFTER the trade date, which require
     * backward adjustment of the trade date's prices).
     *
     * @param tradeDate The date of the price being adjusted
     * @param actions All corporate actions for this security (sorted by effectiveDate)
     * @param closeOnActionDate Map of effectiveDate -> close price (for dividend adjustment)
     * @returns Cumulative adjustment factor (multiply raw prices by this)
     */
    static computeAdjustmentFactor(
        tradeDate: Date,
        actions: CorporateActionInput[],
        closeOnActionDate?: Map<string, number>
    ): number {
        let factor = 1.0;

        for (const action of actions) {
            // Only consider actions that occurred AFTER the trade date
            // (these require backward adjustment of historical prices)
            if (action.effectiveDate.getTime() > tradeDate.getTime()) {
                if (action.type === 'SPLIT' && action.splitFactor) {
                    // splitFactor = splitTo / splitFrom (e.g., 4 for 4-for-1)
                    // To adjust pre-split prices: multiply by 1/splitFactor
                    factor /= action.splitFactor;
                } else if (action.type === 'DIVIDEND' && action.dividendAmount) {
                    // Dividend adjustment: pre-ex-date prices are multiplied by
                    // (closeOnExDate - dividend) / closeOnExDate
                    const exDateKey = action.effectiveDate.toISOString().split('T')[0];
                    const closeOnEx = closeOnActionDate?.get(exDateKey);
                    if (closeOnEx && closeOnEx > 0) {
                        factor *= (closeOnEx - action.dividendAmount) / closeOnEx;
                    }
                    // If we don't have the close on ex-date, skip dividend adjustment
                    // (this is a conservative approach — unadjusted is better than wrong adjustment)
                }
            }
        }

        return factor;
    }

    /**
     * Adjusts a single price point for all corporate actions that occurred
     * after the trade date.
     *
     * @param rawPrice The raw OHLC price
     * @param tradeDate The date of this price
     * @param actions All corporate actions for this security
     * @param closeOnActionDate Optional map of ex-date -> close price for dividend adjustment
     * @returns Adjusted price + the adjustment factor used
     */
    static adjustPrice(
        rawPrice: RawPrice,
        tradeDate: Date,
        actions: CorporateActionInput[],
        closeOnActionDate?: Map<string, number>
    ): AdjustedPrice {
        const factor = CorporateActionAdjuster.computeAdjustmentFactor(
            tradeDate,
            actions,
            closeOnActionDate
        );

        return {
            open: rawPrice.open * factor,
            high: rawPrice.high * factor,
            low: rawPrice.low * factor,
            close: rawPrice.close * factor,
            adjustmentFactor: factor,
        };
    }

    /**
     * Adjusts a series of historical prices for corporate actions.
     *
     * This is the standard "adjusted close" methodology:
     * - Prices before a split ex-date are divided by the split factor
     * - Prices before a dividend ex-date are reduced by the dividend yield
     * - The most recent prices are unadjusted (factor = 1.0)
     *
     * @param prices Array of { date, open, high, low, close } sorted by date ascending
     * @param actions All corporate actions for this security
     * @returns Array of adjusted prices with adjustment factors
     */
    static adjustPriceSeries(
        prices: Array<{ tradeDate: Date } & RawPrice>,
        actions: CorporateActionInput[]
    ): Array<{ tradeDate: Date } & AdjustedPrice> {
        // Build a map of close prices on action ex-dates for dividend adjustment
        const closeOnActionDate = new Map<string, number>();
        for (const price of prices) {
            const dateKey = price.tradeDate.toISOString().split('T')[0];
            closeOnActionDate.set(dateKey, price.close);
        }

        return prices.map(p => {
            const adjusted = CorporateActionAdjuster.adjustPrice(
                { open: p.open, high: p.high, low: p.low, close: p.close },
                p.tradeDate,
                actions,
                closeOnActionDate
            );
            return {
                tradeDate: p.tradeDate,
                ...adjusted,
            };
        });
    }

    /**
     * Computes the adjusted close for a single price point.
     * Convenience method for when only close is needed.
     */
    static adjustClose(
        rawClose: number,
        tradeDate: Date,
        actions: CorporateActionInput[],
        closeOnActionDate?: Map<string, number>
    ): { adjustedClose: number; adjustmentFactor: number } {
        const factor = CorporateActionAdjuster.computeAdjustmentFactor(
            tradeDate,
            actions,
            closeOnActionDate
        );
        return {
            adjustedClose: rawClose * factor,
            adjustmentFactor: factor,
        };
    }
}
