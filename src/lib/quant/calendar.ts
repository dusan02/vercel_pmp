import holidaysData from './holidays.json';
import earlyClosesData from './early-closes.json';

export type SessionClassification = 'PRE_MARKET' | 'REGULAR' | 'AFTER_HOURS' | 'CLOSED';

export interface SessionState {
  classification: SessionClassification;
  isRegular: boolean;
}

export class ExchangeCalendar {
  private formatter: Intl.DateTimeFormat;
  private holidays = new Set(holidaysData.map(h => h.date));
  private earlyCloses = new Set(earlyClosesData.map(e => e.date));

  constructor(public timeZone: string = 'America/New_York') {
    this.formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: this.timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });
  }

  getSession(timestamp: Date): SessionState {
    const parts = this.formatter.formatToParts(timestamp);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;

    const weekday = getPart('weekday');
    if (weekday === 'Sat' || weekday === 'Sun') {
      return { classification: 'CLOSED', isRegular: false };
    }

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    // Format YYYY-MM-DD
    const dateStr = `${year}-${(month ?? '').padStart(2, '0')}-${(day ?? '').padStart(2, '0')}`;

    if (this.holidays.has(dateStr)) {
      return { classification: 'CLOSED', isRegular: false };
    }

    const isEarlyClose = this.earlyCloses.has(dateStr);

    let hour = parseInt(getPart('hour') || '0', 10);
    // Handle 24:00 edge case in some Intl environments mapping midnight to 24
    if (hour === 24) hour = 0; 
    
    const minute = parseInt(getPart('minute') || '0', 10);
    const second = parseInt(getPart('second') || '0', 10);

    const timeInHours = hour + (minute / 60) + (second / 3600);

    const closeHour = isEarlyClose ? 13.0 : 16.0;

    if (timeInHours >= 4 && timeInHours < 9.5) {
      return { classification: 'PRE_MARKET', isRegular: false };
    }
    
    if (timeInHours >= 9.5 && timeInHours < closeHour) {
      return { classification: 'REGULAR', isRegular: true };
    }
    
    if (timeInHours >= closeHour && timeInHours < 20.0) {
      return { classification: 'AFTER_HOURS', isRegular: false };
    }

    return { classification: 'CLOSED', isRegular: false };
  }
}
