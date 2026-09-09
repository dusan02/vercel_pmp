export interface TickerHistory {
    readonly ticker: string;
    readonly validFrom: string; // ISO8601
    readonly validTo: string | null;
}

export interface ExchangeHistory {
    readonly exchange: string;
    readonly validFrom: string;
    readonly validTo: string | null;
}

export interface EntityMasterRecord {
    readonly cik: string;
    readonly securityId: string;
    readonly securityType: string; // COMMON_STOCK, ETF, etc.
    readonly tickerHistory: TickerHistory[];
    readonly exchangeHistory: ExchangeHistory[];
    readonly startDate: string;
    readonly endDate: string | null;
    readonly delistingDate: string | null;
    readonly delistingReason: string | null;
    readonly source: string;
}
