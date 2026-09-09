import { NyseCalendar } from './NyseCalendar';

export class GapClassifier {
    /**
     * Strictly classifies a missing data point.
     * Only returns TRUE if the date is a valid trading session, the security was
     * actively listed on that date, AND the provider returned no price.
     * Index membership is NOT required to define a provider price gap.
     */
    public static isProviderGap(
        dateStr: string, 
        isListedAtDate: boolean
    ): boolean {
        if (!NyseCalendar.isTradingDay(dateStr)) return false;
        if (!isListedAtDate) return false;
        return true;
    }
}
