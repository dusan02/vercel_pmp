export type Instant = string;

export type GapClassification = "VALID" | "HALTED" | "DATA_MISSING";

export interface PitFundamental {
    readonly cik: string;
    readonly metric: string;
    readonly economicPeriodEnd: string;
    readonly acceptanceDateTime: Instant;
    readonly accessionNumber: string;
    readonly contextRef: string;
    readonly value: number;
}

export interface PitEstimate {
    readonly cik: string;
    readonly metricName: string;
    readonly fiscalPeriod: string;
    readonly consensusValue: number;
    readonly knownAt: Instant;
}

export interface MarketBar {
    readonly ticker: string;
    readonly date: string; // Used for daily resolution
    readonly startTime: Instant;
    readonly endTime: Instant;
    readonly open: number;
    readonly high: number;
    readonly low: number;
    readonly close: number;
    readonly volume: number;
    readonly classification: GapClassification;
}

export interface SignalContext {
    readonly observationTime: Instant;
    readonly informationAvailableAt: Instant;
    readonly marketSession: string;
}

export interface Signal {
    readonly cik: string;
    readonly generatedAt: Instant; 
    readonly maxInformationAvailableAt: Instant;
    readonly direction: 1 | -1 | 0;
    readonly score: number;
}

export interface Execution {
    readonly cik: string;
    readonly executedAt: Instant;
    readonly fillPrice: number;
}
