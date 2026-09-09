export class NyseCalendar {
    private static cachedHolidays = new Set<string>();
    private static initialized = false;

    private static SPECIAL_CLOSURES = [
        '2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14',
        '2004-06-11', '2007-01-02', '2012-10-29', '2012-10-30', '2018-12-05'
    ];

    private static init() {
        if (this.initialized) return;
        for (let year = 1990; year <= 2030; year++) {
            this.generateHolidaysForYear(year).forEach(d => this.cachedHolidays.add(d));
        }
        this.SPECIAL_CLOSURES.forEach(d => this.cachedHolidays.add(d));
        this.initialized = true;
    }

    private static getObservedHoliday(year: number, month: number, day: number, isNewYears: boolean = false): string | null {
        const d = new Date(Date.UTC(year, month, day));
        const wday = d.getUTCDay();
        if (wday === 6) { // Saturday
            if (isNewYears) return null; // NYSE does not observe New Year's on Friday when it falls on Saturday.
            d.setUTCDate(d.getUTCDate() - 1);
        } else if (wday === 0) { // Sunday -> observed Monday
            d.setUTCDate(d.getUTCDate() + 1);
        }
        return d.toISOString().split('T')[0];
    }

    private static getNthDayOfMonth(year: number, month: number, n: number, targetDayOfWeek: number): string {
        let count = 0;
        for (let day = 1; day <= 31; day++) {
            const d = new Date(Date.UTC(year, month, day));
            if (d.getUTCMonth() !== month) break;
            if (d.getUTCDay() === targetDayOfWeek) {
                count++;
                if (count === n) return d.toISOString().split('T')[0];
            }
        }
        return '';
    }

    private static getLastDayOfMonth(year: number, month: number, targetDayOfWeek: number): string {
        for (let day = 31; day >= 1; day--) {
            const d = new Date(Date.UTC(year, month, day));
            if (d.getUTCMonth() === month && d.getUTCDay() === targetDayOfWeek) {
                return d.toISOString().split('T')[0];
            }
        }
        return '';
    }

    private static getGoodFriday(year: number): string {
        const a = year % 19, b = Math.floor(year / 100), c = year % 100;
        const d = Math.floor(b / 4), e = b % 4;
        const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4), k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1;
        const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
        
        const easter = new Date(Date.UTC(year, easterMonth, easterDay));
        const goodFriday = new Date(easter.getTime() - 2 * 24 * 60 * 60 * 1000);
        return goodFriday.toISOString().split('T')[0];
    }

    private static generateHolidaysForYear(year: number): string[] {
        const h = [];
        const ny = this.getObservedHoliday(year, 0, 1, true); // New Year's exception
        if (ny) h.push(ny);
        if (year >= 1998) h.push(this.getNthDayOfMonth(year, 0, 3, 1)); // MLK
        h.push(this.getNthDayOfMonth(year, 1, 3, 1)); // Washington
        h.push(this.getGoodFriday(year));
        h.push(this.getLastDayOfMonth(year, 4, 1)); // Memorial
        if (year >= 2022) h.push(this.getObservedHoliday(year, 5, 19) as string); // Juneteenth
        h.push(this.getObservedHoliday(year, 6, 4) as string); // July 4
        h.push(this.getNthDayOfMonth(year, 8, 1, 1)); // Labor Day
        h.push(this.getNthDayOfMonth(year, 10, 4, 4)); // Thanksgiving
        h.push(this.getObservedHoliday(year, 11, 25) as string); // Christmas
        return h;
    }

    public static isTradingDay(dateStr: string): boolean {
        this.init();
        const d = new Date(dateStr);
        const day = d.getUTCDay();
        if (day === 0 || day === 6) return false;
        return !this.cachedHolidays.has(dateStr);
    }
}
