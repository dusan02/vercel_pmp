export class MarketClock {
    private static getEasternParts(date: Date) {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false, weekday: 'short'
        });
        const parts = formatter.formatToParts(date);
        const map: any = {};
        for (const p of parts) map[p.type] = p.value;
        return map; 
    }

    static getNextExecutableTime(infoTime: Date): Date {
        const next = new Date(infoTime.getTime());
        next.setMilliseconds(0);
        next.setSeconds(next.getSeconds() + 1); // Strictly AFTER infoTime

        while (true) {
            const et = this.getEasternParts(next);
            const isWeekend = et.weekday === 'Sat' || et.weekday === 'Sun';
            
            const hour = parseInt(et.hour);
            const min = parseInt(et.minute);
            const timeVal = hour * 100 + min; 

            const isRegularMarketHours = !isWeekend && (timeVal >= 930 && timeVal < 1600);

            if (isRegularMarketHours) {
                // If we enter regular hours, and we just jumped over the boundary (or walked into it), snap to exactly 09:30 or current minute
                // If it's the start of the day, snap to 09:30:00
                if (timeVal === 930) {
                    next.setSeconds(0);
                }
                return next;
            }

            // Move forward safely. Since we want to snap to 09:30 EXACTLY if we crossed a day:
            // If we are past 16:00, or weekend, or pre-9:30, jump exactly to 09:30 next valid day.
            if (isWeekend || timeVal >= 1600 || timeVal < 930) {
                 // Advance by 30 mins to avoid infinite loops, but snap minutes to 0 or 30 to eventually hit exactly 09:30
                 next.setMinutes(next.getMinutes() < 30 ? 30 : 0);
                 if (next.getMinutes() === 0) next.setHours(next.getHours() + 1);
            } else {
                 next.setMinutes(next.getMinutes() + 1);
            }
        }
    }

    static getDecisionTime(infoTime: Date): Date {
        return this.getNextExecutableTime(infoTime);
    }
}
