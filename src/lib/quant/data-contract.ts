import { ExchangeCalendar, SessionClassification } from './calendar';

export interface RawMarketBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RawCorporateAction {
  type: 'DIVIDEND' | 'SPLIT' | 'REVERSE_SPLIT' | 'DELISTING';
  exDate: string;
  recordDate?: string;
  payDate?: string;
  amount?: number;
  ratio?: number;
}

export interface ValidatorConfig {
  expectedPeriodicityMs?: number;
  requireRegularSessionOnly: boolean;
  rejectZeroVolume: boolean;
}

export type AnomalyType = 'GAP' | 'DUPLICATE' | 'OUT_OF_SESSION' | 'CORRUPT' | 'WARNING';

export interface ValidationIssue {
  type: AnomalyType;
  index: number;
  timestamp: Date;
  message: string;
}

export interface ValidationReport {
  isAccepted: boolean;
  issues: ValidationIssue[];
}

export class DataContractValidator {
  private etFormatter: Intl.DateTimeFormat;

  constructor(private calendar: ExchangeCalendar, private config: ValidatorConfig) {
    this.etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
  }

  private getSessionId(date: Date): string {
    const parts = this.etFormatter.formatToParts(date);
    return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}-${parts.find(p=>p.type==='day')?.value}`;
  }

  public validateBars(bars: RawMarketBar[]): ValidationReport {
    const issues: ValidationIssue[] = [];
    let isAccepted = true;
    let lastTime = 0;
    let lastSessionId = '';

    const addIssue = (type: AnomalyType, index: number, timestamp: Date, message: string) => {
      issues.push({ type, index, timestamp, message });
      if (type === 'CORRUPT' || type === 'DUPLICATE' || type === 'OUT_OF_SESSION') {
        isAccepted = false;
      }
    };

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      if (!bar) continue;

      if (!(bar.timestamp instanceof Date) || !Number.isFinite(bar.timestamp.getTime())) {
         addIssue('CORRUPT', i, bar.timestamp || new Date(0), 'Invalid Date object or NaN timestamp');
         continue;
      }

      const t = bar.timestamp.getTime();

      if (t === lastTime) {
        addIssue('DUPLICATE', i, bar.timestamp, 'Exact timestamp duplicate');
      } else if (t < lastTime) {
        addIssue('CORRUPT', i, bar.timestamp, 'Time-travel detected (unsorted data)');
      }
      
      const isFin = (n: number) => typeof n === 'number' && Number.isFinite(n);
      if (!isFin(bar.open) || !isFin(bar.high) || !isFin(bar.low) || !isFin(bar.close) || !isFin(bar.volume)) {
        addIssue('CORRUPT', i, bar.timestamp, 'NaN or Infinity value detected in OHLCV');
      }

      if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
        addIssue('CORRUPT', i, bar.timestamp, 'Zero or negative price');
      }

      // Exact OHLC bounding invariant
      if (bar.low > bar.high) {
        addIssue('CORRUPT', i, bar.timestamp, 'Low is strictly greater than High');
      }
      if (bar.open < bar.low - 1e-6 || bar.open > bar.high + 1e-6) {
        addIssue('CORRUPT', i, bar.timestamp, 'Open is outside [Low, High] bounds');
      }
      if (bar.close < bar.low - 1e-6 || bar.close > bar.high + 1e-6) {
        addIssue('CORRUPT', i, bar.timestamp, 'Close is outside [Low, High] bounds');
      }

      if (bar.volume < 0) {
        addIssue('CORRUPT', i, bar.timestamp, 'Negative volume');
      } else if (bar.volume === 0) {
        if (this.config.rejectZeroVolume) addIssue('CORRUPT', i, bar.timestamp, 'Zero volume (Strict Policy)');
        else addIssue('WARNING', i, bar.timestamp, 'Zero volume detected');
      }

      const session = this.calendar.getSession(bar.timestamp);
      if (session.classification === 'CLOSED') {
        addIssue('OUT_OF_SESSION', i, bar.timestamp, 'Bar on explicitly CLOSED calendar day');
      } else if (this.config.requireRegularSessionOnly && !session.isRegular) {
        addIssue('OUT_OF_SESSION', i, bar.timestamp, `Bar outside REGULAR session (${session.classification})`);
      }

      const currentSessionId = this.getSessionId(bar.timestamp);
      
      if (this.config.expectedPeriodicityMs && lastTime > 0 && t > lastTime) {
        if (lastSessionId === currentSessionId) {
          const distance = t - lastTime;
          if (distance !== this.config.expectedPeriodicityMs) {
            addIssue('GAP', i, bar.timestamp, `In-session gap: Expected ${this.config.expectedPeriodicityMs}ms, got ${distance}ms`);
          }
        }
      }

      lastTime = t;
      lastSessionId = currentSessionId;
    }

    // A GAP doesn't strictly reject the dataset entirely (it might trigger a quarantine or localized handling policy)
    // but CORRUPT, DUPLICATE, and OUT_OF_SESSION do.
    return { isAccepted, issues };
  }

  public validateCorporateActions(actions: RawCorporateAction[]): void {
    // Structural validity only. Economic plausibility goes to Reconciler.
    for (const action of actions) {
      if (!action.exDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        throw new Error(`DATA_CONTRACT_VIOLATION: Invalid exDate format '${action.exDate}'`);
      }
      
      const d = new Date(`${action.exDate}T12:00:00Z`);
      const session = this.calendar.getSession(d);
      if (session.classification === 'CLOSED') {
        throw new Error(`DATA_CONTRACT_VIOLATION: CA exDate ${action.exDate} falls on a CLOSED day`);
      }

      if (action.type === 'DIVIDEND' && (!Number.isFinite(action.amount) || action.amount! <= 0)) {
        throw new Error(`DATA_CONTRACT_VIOLATION: DIVIDEND missing positive finite amount`);
      }
      if ((action.type === 'SPLIT' || action.type === 'REVERSE_SPLIT') && (!Number.isFinite(action.ratio) || action.ratio! <= 0)) {
        throw new Error(`DATA_CONTRACT_VIOLATION: SPLIT missing positive finite ratio`);
      }
    }
  }
}
