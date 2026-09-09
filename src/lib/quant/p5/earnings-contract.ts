/**
 * 3P.5 — Vendor-Neutral Earnings/Estimates Acquisition Contract
 *
 * This file defines the canonical domain model and adapter interface that ALL
 * earnings/estimates vendors (Zacks, Estimize, FactSet, LSEG/IBES, etc.) must
 * map to. The contract is vendor-neutral: whichever vendor is chosen in the
 * 3P.4.2 decision gate, the adapter simply maps vendor fields to these types.
 *
 * Design principles:
 * 1. securityId is the internal link to PitSecurity / EwSecurity — never a raw ticker
 * 2. observationDate / publishedAt / reportDate are knowledge timestamps (PIT as-of T)
 * 3. Consensus observations are immutable (supersededAt chain, never overwritten)
 * 4. No future leakage: revisions after T1 must not affect consensus at T1
 *
 * This contract supersedes the p4 VendorDataSource interface (which used raw
 * tickers). The p4 interface remains for the PIT Validation Harness; production
 * ingestion uses this contract.
 */

// ─── Source Identifiers ────────────────────────────────────────────────

/**
 * Known vendor sources. Extensible — new vendors add their identifier here.
 */
export type EarningsSource =
    | "ZACKS"
    | "ESTIMIZE"
    | "WALLSTREET"
    | "FACTSET"
    | "LSEG_IBES"
    | "SP_CAPITAL_IQ"
    | "VISIBLE_ALPHA";

/**
 * Canonical metric names. Vendors map their metric labels to these.
 */
export type MetricName = "EPS" | "REVENUE" | "EBITDA" | "EBIT" | "NET_INCOME";

// ─── Core Domain Model ─────────────────────────────────────────────────

/**
 * A single consensus observation at a point in time.
 *
 * This is the "state of the world" at observationDate — what an investor
 * would have seen on that date for the given security + fiscal period + metric.
 *
 * PIT invariant: observationDate is the knowledge timestamp. It is NOT the
 * report date, NOT the period end date. It is the date when this consensus
 * was knowable.
 *
 * Immutability: once persisted, a consensus observation is never overwritten.
 * When a new observation arrives for the same (security, period, metric), it
 * is inserted as a new row. The prior observation's supersededAt is set to
 * the new observation's observationDate.
 */
export interface ConsensusObservation {
    /** Internal security ID — links to PitSecurity / EwSecurity */
    readonly securityId: string;

    /** Fiscal period identifier, e.g. "2019-Q1" or "FY2019" */
    readonly fiscalPeriod: string;

    /** Canonical metric name (EPS, REVENUE, etc.) */
    readonly metricName: MetricName;

    /** ISO date — the PIT as-of T (when this consensus was known) */
    readonly observationDate: string;

    /** Mean consensus estimate */
    readonly consensusMean: number;

    /** Median consensus estimate (null if vendor doesn't provide) */
    readonly consensusMedian: number | null;

    /** Highest analyst estimate (null if vendor doesn't provide) */
    readonly consensusHigh: number | null;

    /** Lowest analyst estimate (null if vendor doesn't provide) */
    readonly consensusLow: number | null;

    /** Standard deviation of estimates (null if vendor doesn't provide) */
    readonly consensusStdDev: number | null;

    /** Number of analysts contributing (null if vendor doesn't provide) */
    readonly analystCount: number | null;

    /** Vendor source identifier */
    readonly source: EarningsSource;

    /** Vendor's unique ID for this observation (for deduplication / traceability) */
    readonly sourceRecordId: string;
}

/**
 * A single analyst estimate revision event.
 *
 * This is the granular evidence that explains why consensus changed between
 * two observation dates. Each revision has a publishedAt timestamp — when the
 * revision became public knowledge.
 *
 * PIT invariant: publishedAt is the knowledge timestamp. Revisions after T1
 * must not affect consensus at T1.
 */
export interface EstimateRevision {
    /** Internal security ID — links to PitSecurity / EwSecurity */
    readonly securityId: string;

    /** Fiscal period identifier, e.g. "2019-Q1" or "FY2019" */
    readonly fiscalPeriod: string;

    /** Canonical metric name */
    readonly metricName: MetricName;

    /** ISO timestamp — when the revision became public knowledge */
    readonly publishedAt: string;

    /** Analyst name (null if vendor doesn't expose individual analysts) */
    readonly analystName: string | null;

    /** Broker/firm name (null if vendor doesn't expose) */
    readonly brokerName: string | null;

    /** Prior estimate value (null if this is the analyst's first estimate) */
    readonly priorEstimate: number | null;

    /** New estimate value (null if the analyst withdrew their estimate) */
    readonly newEstimate: number | null;

    /** Vendor source identifier */
    readonly source: EarningsSource;

    /** Vendor's unique ID for this revision (for deduplication / traceability) */
    readonly sourceRecordId: string;
}

/**
 * An actual earnings report — the realized value for a fiscal period.
 *
 * PIT invariant: reportDate is the knowledge timestamp — when the actual
 * was published and became public knowledge. Pre-report consensus must use
 * observations with observationDate < reportDate.
 */
export interface ActualObservation {
    /** Internal security ID — links to PitSecurity / EwSecurity */
    readonly securityId: string;

    /** Fiscal period identifier, e.g. "2019-Q1" or "FY2019" */
    readonly fiscalPeriod: string;

    /** Canonical metric name */
    readonly metricName: MetricName;

    /** Realized actual value */
    readonly actualValue: number;

    /** ISO timestamp — when the actual was published */
    readonly reportDate: string;

    /** Vendor source identifier */
    readonly source: EarningsSource;

    /** Vendor's unique ID for this actual (for deduplication / traceability) */
    readonly sourceRecordId: string;
}

/**
 * Security identity mapping (vendor → internal).
 *
 * Maps a vendor's security identifier (ticker, CIK, CUSIP) to the internal
 * securityId used throughout the PIT engine. This handles ticker changes,
 * delistings, and vendor-specific identifier schemes.
 *
 * PIT invariant: effectiveFrom / effectiveTo define the time range during
 * which this mapping was valid. A ticker change creates a new mapping row
 * with a new effectiveFrom, and the old row gets an effectiveTo.
 */
export interface VendorSecurityMapping {
    /** Vendor's ticker symbol */
    readonly vendorTicker: string;

    /** Vendor's CIK identifier (null if vendor doesn't provide) */
    readonly vendorCik: string | null;

    /** Vendor's CUSIP identifier (null if vendor doesn't provide) */
    readonly vendorCusip: string | null;

    /** Internal security ID — links to PitSecurity / EwSecurity */
    readonly internalSecurityId: string;

    /** ISO date — when this mapping became valid */
    readonly effectiveFrom: string;

    /** ISO date — when this mapping ceased to be valid (null = still valid) */
    readonly effectiveTo: string | null;

    /** Vendor source identifier */
    readonly source: EarningsSource;
}

// ─── Vendor Adapter Interface ──────────────────────────────────────────

/**
 * Interface that all earnings/estimates vendor adapters must implement.
 *
 * This is the production ingestion contract. It is vendor-neutral: the
 * EarlyWinners engine calls these methods without knowing which vendor
 * is behind them. Each vendor adapter maps its native fields to the
 * contract types defined above.
 *
 * Relationship to p4 VendorDataSource:
 * - p4's VendorDataSource uses raw tickers and is used by the PIT Validation
 *   Harness for certification testing.
 * - This EarningsVendorAdapter uses internal securityIds and is used by
 *   production ingestion and feature computation.
 * - A p4 adapter can be wrapped by a p5 adapter via the security mapping.
 */
export interface EarningsVendorAdapter {
    /** Vendor name (for logging, deduplication, provenance) */
    readonly vendorName: EarningsSource;

    /**
     * Get the consensus observation as-of a specific date.
     *
     * Returns the latest ConsensusObservation with observationDate <= asOfDate
     * for the given security + fiscal period + metric. Returns null if no
     * observation exists at or before asOfDate.
     *
     * @param securityId  Internal security ID
     * @param fiscalPeriod  e.g. "2019-Q1"
     * @param metricName  Canonical metric (EPS, REVENUE, etc.)
     * @param asOfDate  ISO date — the PIT as-of T
     */
    getConsensusAsOf(
        securityId: string,
        fiscalPeriod: string,
        metricName: MetricName,
        asOfDate: string
    ): Promise<ConsensusObservation | null>;

    /**
     * Get all estimate revisions for a fiscal period within a date range.
     *
     * Returns revisions with publishedAt in (fromDate, toDate]. These are
     * the granular analyst-level events that explain consensus changes.
     *
     * @param securityId  Internal security ID
     * @param fiscalPeriod  e.g. "2019-Q1"
     * @param metricName  Canonical metric
     * @param fromDate  ISO date — exclusive lower bound (revisions after this)
     * @param toDate  ISO date — inclusive upper bound (revisions at or before this)
     */
    getRevisions(
        securityId: string,
        fiscalPeriod: string,
        metricName: MetricName,
        fromDate: string,
        toDate: string
    ): Promise<EstimateRevision[]>;

    /**
     * Get the actual earnings report for a fiscal period.
     *
     * Returns null if no actual has been reported yet.
     *
     * @param securityId  Internal security ID
     * @param fiscalPeriod  e.g. "2019-Q1"
     * @param metricName  Canonical metric
     */
    getActual(
        securityId: string,
        fiscalPeriod: string,
        metricName: MetricName
    ): Promise<ActualObservation | null>;

    /**
     * Get the vendor → internal security mapping for a vendor ticker.
     *
     * Returns the active mapping (effectiveFrom <= now <= effectiveTo) for
     * the given vendor ticker. Returns null if no mapping exists.
     *
     * @param vendorTicker  The vendor's ticker symbol
     */
    getSecurityMapping(
        vendorTicker: string
    ): Promise<VendorSecurityMapping | null>;

    /**
     * Check if the vendor data source is available (API key set, files loaded, etc.)
     */
    isAvailable(): boolean;

    /**
     * Human-readable description of the data source status.
     */
    describeStatus(): string;
}

// ─── PIT Query Helpers ─────────────────────────────────────────────────

/**
 * Utility type for the pre-report consensus query result.
 * This is what feature computation needs: the consensus that was known
 * just before the earnings report was published.
 */
export interface PreReportConsensus {
    /** The consensus observation as-of reportDate - 1 */
    readonly consensus: ConsensusObservation;

    /** The actual report */
    readonly actual: ActualObservation;

    /** Computed surprise percentage */
    readonly epsSurprisePct: number | null;
}

/**
 * Utility type for the revision delta query result.
 * This is what estimateRevisionsPct needs: the consensus at two points
 * in time and the revisions between them.
 */
export interface RevisionDelta {
    /** Consensus at T0 (earlier) */
    readonly consensusT0: ConsensusObservation;

    /** Consensus at T1 (later) */
    readonly consensusT1: ConsensusObservation;

    /** Revisions in the window (T0, T1] */
    readonly revisionsInWindow: EstimateRevision[];

    /** Computed revision percentage */
    readonly estimateRevisionsPct: number | null;
}

// ─── Fiscal Period Helpers ─────────────────────────────────────────────

/**
 * Normalizes a fiscal period string from vendor format to canonical format.
 *
 * Vendors use different representations:
 * - Zacks: per_fisc_year=2019, per_fisc_qtr=1 → "2019-Q1"
 * - Estimize: fiscal_year=2019, fiscal_quarter=1 → "2019-Q1"
 * - Annual: per_fisc_year=2019, per_fisc_qtr=null → "FY2019"
 *
 * @param year  Fiscal year (e.g. 2019)
 * @param quarter  Fiscal quarter (1-4), or null/0 for annual
 * @returns Canonical fiscal period string
 */
export function normalizeFiscalPeriod(year: number, quarter: number | null): string {
    if (quarter === null || quarter === 0) {
        return `FY${year}`;
    }
    return `${year}-Q${quarter}`;
}

/**
 * Parses a canonical fiscal period string back into year and quarter.
 *
 * @param fiscalPeriod  e.g. "2019-Q1" or "FY2019"
 * @returns { year, quarter } where quarter is null for annual periods
 */
export function parseFiscalPeriod(fiscalPeriod: string): { year: number; quarter: number | null } {
    const quarterlyMatch = fiscalPeriod.match(/^(\d{4})-Q(\d)$/);
    if (quarterlyMatch) {
        return {
            year: parseInt(quarterlyMatch[1]!),
            quarter: parseInt(quarterlyMatch[2]!),
        };
    }
    const annualMatch = fiscalPeriod.match(/^FY(\d{4})$/);
    if (annualMatch) {
        return {
            year: parseInt(annualMatch[1]!),
            quarter: null,
        };
    }
    throw new Error(`Unrecognized fiscal period format: ${fiscalPeriod}`);
}
