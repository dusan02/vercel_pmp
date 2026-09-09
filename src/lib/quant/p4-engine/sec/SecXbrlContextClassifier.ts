export type XbrlPeriodType = 'INSTANT' | 'QUARTER' | 'YTD' | 'FY' | 'UNKNOWN';

export type XbrlEvidenceLevel = 'DEFINITIVE' | 'STRONG' | 'INCONCLUSIVE' | 'CONFLICT';

export interface XbrlFactContextInput {
    /** Economic period start date (YYYY-MM-DD). Absent for instant facts. */
    start?: string | null;

    /** Economic period end date (YYYY-MM-DD). Mandatory. */
    end: string;

    /** Explicit instant date if provided in instance XBRL (YYYY-MM-DD). */
    instant?: string | null;

    /** Fiscal Year as stated by filer in filing metadata (e.g., 2024). */
    fy?: number | null;

    /** Fiscal Period as stated by filer (e.g., "Q1", "Q2", "Q3", "Q4", "FY", "CY"). */
    fp?: string | null;

    /** Regulatory form type (e.g., "10-K", "10-Q", "10-K/A", "10-Q/A", "8-K"). */
    form?: string | null;

    /** SEC calendar frame (e.g., "CY2024Q1", "CY2024", "CY2024Q1I"). */
    frame?: string | null;

    /** Regulatory filing date (YYYY-MM-DD). NOT knowledge time. */
    filed?: string | null;

    /** EDGAR accession number of the source document. */
    accn?: string | null;

    /** P0 Knowledge Time: SEC acceptedAt timestamp from Worker 2. */
    acceptedAt?: Date | string | null;
}

export interface XbrlContextClassificationResult {
    classification: XbrlPeriodType;
    evidenceLevel: XbrlEvidenceLevel;
    durationDays: number | null;
    isInstant: boolean;
    is52_53WeekCandidate: boolean;
    reason: string;
    details: {
        startDate: string | null;
        endDate: string | null;
        instantDate: string | null;
        reportedFp: string | null;
        reportedFy: number | null;
        reportedForm: string | null;
        frame: string | null;
    };
}

export class SecXbrlContextClassifier {
    private static readonly DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

    /**
     * Parse calendar date into UTC timestamp safely.
     * Rejects invalid dates (e.g. Feb 30).
     */
    private static parseUtcCalendarDate(dateStr: string): number | null {
        if (!dateStr || typeof dateStr !== 'string' || !this.DATE_REGEX.test(dateStr)) {
            return null;
        }
        const [yearStr, monthStr, dayStr] = dateStr.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        const utcMs = Date.UTC(year, month - 1, day);
        const dateObj = new Date(utcMs);

        // Strict day/month/year round-trip validation (catches Feb 30, April 31, etc.)
        if (
            dateObj.getUTCFullYear() !== year ||
            dateObj.getUTCMonth() !== month - 1 ||
            dateObj.getUTCDate() !== day
        ) {
            return null;
        }

        return utcMs;
    }

    /**
     * Pure, deterministic XBRL context classifier.
     * Classifies raw XBRL facts strictly into: INSTANT | QUARTER | YTD | FY | UNKNOWN.
     * TTM is explicitly excluded (TTM is a derived metric in downstream quant engine).
     * Does NOT treat short 1-day durations as INSTANT.
     * Strictly validates the 'instant' field if supplied.
     */
    public static classify(context: XbrlFactContextInput): XbrlContextClassificationResult {
        const details = {
            startDate: context.start ?? null,
            endDate: context.end ?? null,
            instantDate: context.instant ?? null,
            reportedFp: context.fp ? String(context.fp).toUpperCase().trim() : null,
            reportedFy: typeof context.fy === 'number' ? context.fy : null,
            reportedForm: context.form ? String(context.form).toUpperCase().trim() : null,
            frame: context.frame ? String(context.frame).trim() : null
        };

        // Gate 1: End date validity
        if (!context.end || typeof context.end !== 'string') {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'CONFLICT',
                durationDays: null,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: "Missing mandatory 'end' date.",
                details
            };
        }

        const endUtc = this.parseUtcCalendarDate(context.end);
        if (endUtc === null) {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'CONFLICT',
                durationDays: null,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: `Malformed or invalid calendar 'end' date: '${context.end}'.`,
                details
            };
        }

        // Gate 2: Explicit 'instant' field validation (Track A)
        if (context.instant !== undefined && context.instant !== null && context.instant !== '') {
            const instantUtc = this.parseUtcCalendarDate(context.instant);
            if (instantUtc === null) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'CONFLICT',
                    durationDays: null,
                    isInstant: true,
                    is52_53WeekCandidate: false,
                    reason: `Malformed or invalid calendar 'instant' date: '${context.instant}'.`,
                    details
                };
            }

            // Invariant: instant date must agree with end date
            if (context.instant !== context.end) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'CONFLICT',
                    durationDays: null,
                    isInstant: true,
                    is52_53WeekCandidate: false,
                    reason: `Conflict: explicit instant date '${context.instant}' does not match end date '${context.end}'.`,
                    details
                };
            }

            // Invariant: instant fact must not specify an incompatible distinct start date
            if (context.start && context.start !== context.instant) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'CONFLICT',
                    durationDays: null,
                    isInstant: true,
                    is52_53WeekCandidate: false,
                    reason: `Conflict: fact specifies explicit instant '${context.instant}' but also a distinct start '${context.start}'.`,
                    details
                };
            }

            // Frame conflict check for explicit instant
            if (details.frame && !details.frame.endsWith('I') && /^CY\d{4}(Q\d)?$/.test(details.frame)) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'CONFLICT',
                    durationDays: 0,
                    isInstant: true,
                    is52_53WeekCandidate: false,
                    reason: `Explicit instant fact has conflicting duration frame '${details.frame}'.`,
                    details
                };
            }

            return {
                classification: 'INSTANT',
                evidenceLevel: details.frame?.endsWith('I') ? 'DEFINITIVE' : 'STRONG',
                durationDays: 0,
                isInstant: true,
                is52_53WeekCandidate: false,
                reason: "Instant point-in-time state confirmed by explicit 'instant' field matching 'end'.",
                details
            };
        }

        // Gate 3: Inherent Instant facts (start is absent, empty, or equals end)
        const isStartAbsent = context.start === undefined || context.start === null || context.start === '';
        if (isStartAbsent || context.start === context.end) {
            // Check frame for duration conflict
            if (details.frame && !details.frame.endsWith('I') && /^CY\d{4}(Q\d)?$/.test(details.frame)) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'CONFLICT',
                    durationDays: 0,
                    isInstant: true,
                    is52_53WeekCandidate: false,
                    reason: `Instant fact has conflicting duration frame '${details.frame}'.`,
                    details
                };
            }

            return {
                classification: 'INSTANT',
                evidenceLevel: details.frame?.endsWith('I') ? 'DEFINITIVE' : 'STRONG',
                durationDays: 0,
                isInstant: true,
                is52_53WeekCandidate: false,
                reason: isStartAbsent ? "Instant point-in-time state (start date absent)." : "Instant point-in-time state (start equals end).",
                details
            };
        }

        // Gate 4: Duration facts (start is present and distinct from end)
        const startUtc = this.parseUtcCalendarDate(context.start!);
        if (startUtc === null) {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'CONFLICT',
                durationDays: null,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: `Malformed or invalid calendar 'start' date: '${context.start}'.`,
                details
            };
        }

        // Inverted dates check
        if (startUtc > endUtc) {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'CONFLICT',
                durationDays: null,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: `Inverted date boundaries: start (${context.start}) is after end (${context.end}).`,
                details
            };
        }

        // Precise calendar day difference
        const durationDays = Math.round((endUtc - startUtc) / 86400000);

        // Track A Fix: Micro-duration flow (1 to 79 days) is NOT an INSTANT snapshot!
        // A duration fact with start != end is an economic flow. If < 80 days, it is a micro-flow or stub.
        if (durationDays < 80) {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'INCONCLUSIVE',
                durationDays,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: `Short duration flow of ${durationDays} days is not an instant snapshot and not a standard quarterly/annual period.`,
                details
            };
        }

        // Frame instant conflict (frame says instant 'I', but duration >= 80 days)
        if (details.frame?.endsWith('I')) {
            return {
                classification: 'UNKNOWN',
                evidenceLevel: 'CONFLICT',
                durationDays,
                isInstant: false,
                is52_53WeekCandidate: false,
                reason: `Duration fact (${durationDays}d) has conflicting instant frame '${details.frame}'.`,
                details
            };
        }

        // Track C Fix: Clean 52/53-week candidate detection
        // 13-14 weeks: delta 89 to 98 days
        // 52-53 weeks: delta 363 to 372 days
        const is52_53WeekCandidate = 
            (durationDays >= 89 && durationDays <= 98) ||
            (durationDays >= 363 && durationDays <= 372);

        // Gate 5: QUARTER Classification (~3 months: 80 to 105 days)
        if (durationDays >= 80 && durationDays <= 105) {
            let reason = `Quarterly economic duration of ${durationDays} days (~3 months).`;
            let evidenceLevel: XbrlEvidenceLevel = 'STRONG';

            if (details.reportedFp && /^Q[1-4]$/.test(details.reportedFp)) {
                evidenceLevel = 'DEFINITIVE';
                reason += ` Confirmed by reported fp='${details.reportedFp}'.`;
            } else if (details.reportedForm === '10-K' || details.reportedForm === '10-K/A' || details.reportedFp === 'FY') {
                // Standalone Q4 reported inside 10-K
                evidenceLevel = 'STRONG';
                reason += ` Standalone fourth-quarter results reported inside 10-K.`;
            }

            // If frame erroneously indicates an annual CY frame, duration overrules it
            if (details.frame && /^CY\d{4}$/.test(details.frame)) {
                reason += ` Overrules conflicting annual frame '${details.frame}'.`;
            }

            return {
                classification: 'QUARTER',
                evidenceLevel,
                durationDays,
                isInstant: false,
                is52_53WeekCandidate,
                reason,
                details
            };
        }

        // Gate 6: YTD Classification (6-month or 9-month periods)
        // 6-Month YTD: 160 to 200 days
        if (durationDays >= 160 && durationDays <= 200) {
            return {
                classification: 'YTD',
                evidenceLevel: details.reportedFp === 'Q2' ? 'DEFINITIVE' : 'STRONG',
                durationDays,
                isInstant: false,
                is52_53WeekCandidate,
                reason: `Cumulative 6-month half-year duration (${durationDays}d).`,
                details
            };
        }

        // 9-Month YTD: 250 to 295 days
        if (durationDays >= 250 && durationDays <= 295) {
            let reason = `Cumulative 9-month YTD duration (${durationDays}d).`;
            // Crucial: Overrule frame if frame claims Q1/Q2/Q3 for a 9-month fact
            if (details.frame && /^CY\d{4}Q[1-4]$/.test(details.frame)) {
                reason += ` Strictly overrules quarterly frame '${details.frame}' due to 9-month cumulative duration.`;
            }

            return {
                classification: 'YTD',
                evidenceLevel: details.reportedFp === 'Q3' ? 'DEFINITIVE' : 'STRONG',
                durationDays,
                isInstant: false,
                is52_53WeekCandidate,
                reason,
                details
            };
        }

        // Gate 7: FY Classification (350 to 385 days) (Track B)
        if (durationDays >= 350 && durationDays <= 385) {
            // Check if reported in an interim quarterly report (10-Q) with fp in Q1..Q3
            // An annual ~365d fact in a 10-Q is NOT a validated standalone FY or TTM without accession context!
            if (
                details.reportedForm === '10-Q' || 
                details.reportedForm === '10-Q/A' || 
                (details.reportedFp && /^Q[1-3]$/.test(details.reportedFp))
            ) {
                return {
                    classification: 'UNKNOWN',
                    evidenceLevel: 'INCONCLUSIVE',
                    durationDays,
                    isInstant: false,
                    is52_53WeekCandidate,
                    reason: `Annual duration (${durationDays}d) reported in interim period ${details.reportedFp || details.reportedForm}. Cannot be classified as FY; TTM derivation is deferred to quant engine.`,
                    details
                };
            }

            // Standard Annual (FY) in 10-K or with fp='FY'
            const isStandardAnnual = 
                details.reportedFp === 'FY' || 
                details.reportedForm === '10-K' || 
                details.reportedForm === '10-K/A' || 
                (details.frame && /^CY\d{4}$/.test(details.frame));

            if (isStandardAnnual) {
                return {
                    classification: 'FY',
                    evidenceLevel: 'DEFINITIVE',
                    durationDays,
                    isInstant: false,
                    is52_53WeekCandidate,
                    reason: `Full fiscal year duration (${durationDays}d) confirmed by annual form/fp.`,
                    details
                };
            }

            // Fallback for ~365d without explicit interim fp: Strong FY
            return {
                classification: 'FY',
                evidenceLevel: 'STRONG',
                durationDays,
                isInstant: false,
                is52_53WeekCandidate,
                reason: `Full annual duration (${durationDays}d).`,
                details
            };
        }

        // Gate 8: Irregular / Stub / Ambiguous Durations -> UNKNOWN (Fail-closed)
        return {
            classification: 'UNKNOWN',
            evidenceLevel: 'INCONCLUSIVE',
            durationDays,
            isInstant: false,
            is52_53WeekCandidate: false,
            reason: `Irregular or unclassifiable economic duration of ${durationDays} days.`,
            details
        };
    }

    /**
     * Point-in-Time Availability Guard.
     * Invariant: A fact context is usable IF AND ONLY IF acceptedAt <= evaluationTime.
     * Rejects reliance on regulatory filed date.
     */
    public static isAvailableAt(context: XbrlFactContextInput, evaluationTime: Date): boolean {
        if (!context.acceptedAt) {
            throw new Error("[SecXbrlContextClassifier] Missing acceptedAt timestamp. Knowledge time cannot be determined.");
        }
        const acceptedMs = typeof context.acceptedAt === 'string' ? new Date(context.acceptedAt).getTime() : context.acceptedAt.getTime();
        if (isNaN(acceptedMs)) {
            throw new Error(`[SecXbrlContextClassifier] Invalid acceptedAt timestamp: ${context.acceptedAt}`);
        }
        return acceptedMs <= evaluationTime.getTime();
    }
}
