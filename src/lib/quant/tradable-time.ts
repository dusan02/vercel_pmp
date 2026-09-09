import { ExchangeCalendar } from './calendar';

export class TradableTimeResolver {
  private calendar: ExchangeCalendar;

  constructor(timeZone: string = 'America/New_York') {
    this.calendar = new ExchangeCalendar(timeZone);
  }

  /**
   * Calculates the exact Point-in-Time tradable Open timestamp for a Daily OHLCV strategy.
   * Prevents look-ahead bias by ensuring any information received after 09:30 ET
   * is traded at the NEXT business day's open.
   * 
   * @param acceptanceDatetime The true UTC timestamp of the SEC filing acceptance
   * @returns Date object representing the 09:30 ET open time of the tradable day
   */
  getDailyOpenTradableAt(acceptanceDatetime: Date): Date {
    let t = new Date(acceptanceDatetime.getTime());
    
    // We walk forward in 1-hour increments to find the next valid market open
    // If the event happened at exactly 09:29 ET, the next open is today's 09:30 ET.
    // If the event happened at 09:30 ET or later, today's open is already past, 
    // so we must trade at tomorrow's open.
    
    // Step 1: Find the immediate session state for the event
    const initialState = this.calendar.getSession(t);
    const timeInHours = this.getHoursET(t);

    // If the event is strictly before 09:30 on a regular day, it can be traded TODAY at open.
    // Otherwise, we must move to tomorrow's midnight and find the NEXT open.
    if (initialState.classification === 'PRE_MARKET' || (initialState.classification === 'CLOSED' && timeInHours < 9.5)) {
      // It might be tradeable today if today is a business day
      const checkState = this.calendar.getSession(new Date(t.getTime()));
      // We will handle the exact jump below
    } else {
      // It's 09:30 or later, OR we are closed after hours. Move strictly to midnight tomorrow to avoid today's open.
      t.setUTCHours(t.getUTCHours() + 24);
      t.setUTCHours(4, 0, 0, 0); // Reset to early morning UTC (approx midnight ET)
    }

    // Step 2: Walk forward day by day until we hit a REGULAR trading day
    while (true) {
      // Check 12:00 ET of the current `t` day to see if it's a trading day
      const noon = new Date(t.getTime());
      noon.setUTCHours(16, 0, 0, 0); // 16:00 UTC = 12:00 EDT / 11:00 EST roughly. 
      // Actually, better to just check the session at 09:30 ET.
      
      // Let's set `t` to exactly 09:30 ET on its current local day.
      // Easiest robust way without complex timezone math is to test hours until getSession() returns 'REGULAR'
      const session = this.calendar.getSession(t);
      if (session.isRegular) {
        // We found a regular trading period. The "Open" is exactly the transition to REGULAR.
        // Let's walk back minutes to find the exact 09:30 transition.
        return this.findExactOpen(t);
      }

      // Advance by 1 hour
      t.setTime(t.getTime() + 3600 * 1000);
    }
  }

  private getHoursET(d: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: this.calendar.timeZone,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    }).formatToParts(d);

    let hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    if (hour === 24) hour = 0;
    const min = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const sec = parseInt(parts.find(p => p.type === 'second')?.value || '0', 10);
    return hour + (min / 60) + (sec / 3600);
  }

  private findExactOpen(t: Date): Date {
    // We are currently in REGULAR hours. Walk backwards in 15 minute increments until PRE_MARKET, 
    // then forward in 1 min increments to find the exact 09:30.
    let cursor = new Date(t.getTime());
    
    // Safety limit to prevent infinite loops
    let attempts = 0;
    while (this.calendar.getSession(cursor).isRegular && attempts < 100) {
      cursor.setTime(cursor.getTime() - 15 * 60 * 1000);
      attempts++;
    }

    attempts = 0;
    while (!this.calendar.getSession(cursor).isRegular && attempts < 100) {
      cursor.setTime(cursor.getTime() + 60 * 1000);
      attempts++;
    }

    return cursor;
  }
}
