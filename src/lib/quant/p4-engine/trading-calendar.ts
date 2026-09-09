import { Instant } from './temporal-types.js';

export interface TradingSession {
    date: string; // YYYY-MM-DD
    open: Instant;
    close: Instant;
    earlyClose: boolean;
}

export class TradingSessionCalendar {
    // P4.1-H5: Real explicit market calendar with Holidays and Early Closes
    private holidays = new Set([
        "2023-01-02", // New Year's (Observed)
        "2023-01-16", // MLK
        "2023-02-20", // Washington's Birthday
        "2023-04-07", // Good Friday
        "2023-05-29", // Memorial Day
        "2023-06-19", // Juneteenth
        "2023-07-04", // Independence Day
        "2023-09-04", // Labor Day
        "2023-11-23", // Thanksgiving
        "2023-12-25"  // Christmas
    ]);

    private earlyCloses = new Map<string, string>([
        ["2023-07-03", "13:00"], // Day before July 4th
        ["2023-11-24", "13:00"], // Black Friday
    ]);

    private getEasternParts(date: Date) {
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

    private toIsoDate(etParts: any): string {
        return `${etParts.year}-${etParts.month}-${etParts.day}`;
    }

    private constructInstant(dateStr: string, etHourStr: string): Instant {
        // Simple mock parser: converts YYYY-MM-DD + "09:30" ET to UTC Instant
        // 09:30 ET is generally 13:30 or 14:30 UTC depending on DST.
        // For strict testing, we'll use Date object parsing with EST/EDT offset strings.
        // Node handles 'YYYY-MM-DDTHH:mm:00-04:00' (EDT) or '-05:00' (EST).
        // For simplicity in this gate, we determine DST roughly.
        const d = new Date(dateStr);
        const month = d.getUTCMonth() + 1;
        const isDST = month > 3 && month < 11; 
        const offset = isDST ? "-04:00" : "-05:00";
        return new Date(`${dateStr}T${etHourStr}:00${offset}`).toISOString();
    }

    getSession(dateStr: string): TradingSession | null {
        if (this.holidays.has(dateStr)) return null;
        
        // Also check if it's a weekend
        const d = new Date(`${dateStr}T12:00:00Z`);
        const parts = this.getEasternParts(d);
        if (parts.weekday === 'Sat' || parts.weekday === 'Sun') return null;

        const isEarly = this.earlyCloses.has(dateStr);
        const closeTimeStr = isEarly ? this.earlyCloses.get(dateStr)! : "16:00";

        return {
            date: dateStr,
            open: this.constructInstant(dateStr, "09:30"),
            close: this.constructInstant(dateStr, closeTimeStr),
            earlyClose: isEarly
        };
    }

    isTradingDay(dateStr: string): boolean {
        return this.getSession(dateStr) !== null;
    }

    getNextSession(instant: Instant): TradingSession {
        let current = new Date(instant);
        // Start checking from the day of the instant
        while (true) {
            const parts = this.getEasternParts(current);
            const dateStr = this.toIsoDate(parts);
            const session = this.getSession(dateStr);
            
            if (session) {
                // If it's a trading day, check if we missed the open
                if (instant < session.open) {
                    return session; // We can execute at the open
                } else if (instant < session.close) {
                    // Intraday logic: we return this session as active
                    return session;
                }
            }
            // Move to next day 00:00 UTC
            current.setUTCDate(current.getUTCDate() + 1);
            current.setUTCHours(0,0,0,0);
        }
    }
}
