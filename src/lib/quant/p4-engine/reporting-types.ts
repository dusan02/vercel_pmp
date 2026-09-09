import { EquitySnapshot, TradeRecord, AttributionReport } from './evaluation-types.js';

export interface RunIdentity {
    readonly runId: string;
    readonly configHash: string;
    readonly dataHash: string;
    readonly engineHash: string;
    readonly timestamp: string;
}

export interface ExecutiveSummary {
    readonly initialCapital: number;
    readonly finalNav: number;
    readonly totalReturnPct: number;
    readonly cagrPct: number;
    readonly maxDrawdownPct: number;
    readonly winRatePct: number;
    readonly profitFactor: number;
}

export interface DataQualityReport {
    readonly missingExecutionPrices: number;
    readonly partialFills: number;
    readonly delistingsEncountered: number;
    readonly restatementsProcessed: number;
}

export interface ReproducibilityManifest {
    readonly deterministicReplay: boolean;
    readonly accountingBalance: boolean;
    readonly attributionReconciliation: boolean;
    readonly finalResult: "LOCKED" | "INVALID";
}

export interface FinalReport {
    readonly identity: RunIdentity;
    readonly summary: ExecutiveSummary;
    readonly attribution: AttributionReport;
    readonly dataQuality: DataQualityReport;
    readonly manifest: ReproducibilityManifest;
    readonly tradesCount: number;
}
