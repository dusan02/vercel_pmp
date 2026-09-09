export interface SecAccessionRecord {
    accessionNumber: string;
    form: string;
    baseForm: string;
    isAmendment: boolean;
    filingDate: string;           // Regulatory calendar date YYYY-MM-DD
    reportDate: string | null;     // Period end date YYYY-MM-DD
    acceptanceDateTime: string;   // Exact SEC EDGAR acceptance timestamp ISO
    acceptedAt: Date;             // PARSED KNOWLEDGE TIME - NEVER use filingDate as knowledgeTime
    isXBRL: boolean;
    act?: string;
    fileNumber?: string;
    filmNumber?: string;
    sourceArtifactHash: string;
    supersededBy?: string | null; // Accession number of the amendment that supersedes this filing
    amends?: string | null;        // Accession number of the earlier filing this amendment amends
}

export interface PeriodFilingResolution {
    activeFiling: SecAccessionRecord;
    originalFiling: SecAccessionRecord;
    supersededFilings: SecAccessionRecord[];
    fullLineageChain: SecAccessionRecord[];
}

export class SecAccessionLineageWorker {
    private static readonly SEC_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

    /**
     * Parses raw SEC Submissions JSON into strictly validated, deterministically ordered accession records.
     * Fails closed on any schema corruption, duplicate accessions, or invalid timestamps.
     */
    public static parseSubmissions(rawSubmissionsPayload: string, sourceArtifactHash: string): SecAccessionRecord[] {
        if (!rawSubmissionsPayload || !rawSubmissionsPayload.trim()) {
            throw new Error("[SecAccessionLineageWorker] Empty submissions payload received.");
        }

        let parsed: any;
        try {
            parsed = JSON.parse(rawSubmissionsPayload);
        } catch (err: any) {
            throw new Error(`[SecAccessionLineageWorker] Malformed JSON in submissions: ${err.message}`);
        }

        if (!parsed || typeof parsed !== 'object') {
            throw new Error("[SecAccessionLineageWorker] Submissions payload is not an object.");
        }

        const filings = parsed.filings;
        if (!filings || !filings.recent || typeof filings.recent !== 'object') {
            throw new Error("[SecAccessionLineageWorker] Missing 'filings.recent' in submissions payload.");
        }

        const recent = filings.recent;
        const requiredArrays = ['accessionNumber', 'filingDate', 'acceptanceDateTime', 'form'];
        for (const req of requiredArrays) {
            if (!Array.isArray(recent[req])) {
                throw new Error(`[SecAccessionLineageWorker] Missing or non-array field 'filings.recent.${req}'.`);
            }
        }

        const count = recent.accessionNumber.length;
        for (const req of requiredArrays) {
            if (recent[req].length !== count) {
                throw new Error(`[SecAccessionLineageWorker] Array length mismatch in 'filings.recent': ${req} has ${recent[req].length}, expected ${count}.`);
            }
        }

        const seenAccessions = new Set<string>();
        const records: SecAccessionRecord[] = [];

        for (let i = 0; i < count; i++) {
            const accNum = recent.accessionNumber[i];
            if (!accNum || typeof accNum !== 'string' || !/^\d{10}-\d{2}-\d{6}$/.test(accNum)) {
                throw new Error(`[SecAccessionLineageWorker] Invalid accessionNumber at index ${i}: '${accNum}'. Expected format: 0000000000-00-000000.`);
            }

            if (seenAccessions.has(accNum)) {
                throw new Error(`[SecAccessionLineageWorker] Duplicate accessionNumber detected: '${accNum}'. Invariant violated.`);
            }
            seenAccessions.add(accNum);

            const form = recent.form[i];
            if (!form || typeof form !== 'string') {
                throw new Error(`[SecAccessionLineageWorker] Invalid form at index ${i} for accession '${accNum}'.`);
            }

            const filingDate = recent.filingDate[i];
            if (!filingDate || typeof filingDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) {
                throw new Error(`[SecAccessionLineageWorker] Invalid filingDate at index ${i}: '${filingDate}'.`);
            }

            const acceptanceDateTime = recent.acceptanceDateTime[i];
            if (!acceptanceDateTime || typeof acceptanceDateTime !== 'string') {
                throw new Error(`[SecAccessionLineageWorker] Missing acceptanceDateTime for accession '${accNum}'.`);
            }

            // Strict regex format validation for SEC ISO UTC timestamps
            if (!this.SEC_TIMESTAMP_REGEX.test(acceptanceDateTime)) {
                throw new Error(`[SecAccessionLineageWorker] Invalid SEC acceptanceDateTime format: '${acceptanceDateTime}' for accession '${accNum}'. Expected ISO 8601 UTC.`);
            }

            const acceptedAt = new Date(acceptanceDateTime);
            if (isNaN(acceptedAt.getTime())) {
                throw new Error(`[SecAccessionLineageWorker] Unparseable acceptanceDateTime '${acceptanceDateTime}' for accession '${accNum}'.`);
            }

            const isAmendment = form.includes('/A') || form.endsWith('/A');
            const baseForm = isAmendment ? form.replace(/\/A$/, '') : form;
            const reportDate = recent.reportDate && recent.reportDate[i] ? String(recent.reportDate[i]) : null;
            const isXBRL = Boolean(recent.isXBRL && recent.isXBRL[i] === 1);

            records.push({
                accessionNumber: accNum,
                form,
                baseForm,
                isAmendment,
                filingDate,
                reportDate,
                acceptanceDateTime,
                acceptedAt, // P0 KNOWLEDGE TIME
                isXBRL,
                act: recent.act ? recent.act[i] : undefined,
                fileNumber: recent.fileNumber ? recent.fileNumber[i] : undefined,
                filmNumber: recent.filmNumber ? recent.filmNumber[i] : undefined,
                sourceArtifactHash
            });
        }

        // Deterministic sorting: chronological by acceptedAt ASC, then accessionNumber ASC
        return records.sort((a, b) => {
            const timeDiff = a.acceptedAt.getTime() - b.acceptedAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return a.accessionNumber.localeCompare(b.accessionNumber);
        });
    }

    /**
     * Filters filings visible strictly at evaluationTime.
     * PIT Contract: filing is visible IF AND ONLY IF acceptedAt <= evaluationTime.
     * Uses acceptedAt, NEVER filingDate.
     */
    public static getVisibleFilings(filings: SecAccessionRecord[], evaluationTime: Date): SecAccessionRecord[] {
        const evalMs = evaluationTime.getTime();
        if (isNaN(evalMs)) throw new Error("Invalid evaluationTime provided.");
        return filings.filter(f => f.acceptedAt.getTime() <= evalMs);
    }

    /**
     * Resolves the active filing for a given report period and form at evaluationTime.
     * Implements explicit lineage:
     * - Original filing is NEVER overwritten.
     * - Returns the full lineage chain and explicit supersededBy pointers.
     */
    public static resolveActiveFilingForPeriod(
        filings: SecAccessionRecord[],
        baseForm: string,
        reportDate: string,
        evaluationTime: Date
    ): PeriodFilingResolution | null {
        // Candidates for this economic period & form
        const matchingFilings = filings.filter(f => 
            f.baseForm.toUpperCase() === baseForm.toUpperCase() && 
            f.reportDate === reportDate
        );

        if (matchingFilings.length === 0) return null;

        // Filter only those known at evaluationTime
        const visibleCandidates = this.getVisibleFilings(matchingFilings, evaluationTime);
        if (visibleCandidates.length === 0) return null;

        // Chronological sort: [original, amendment_1, amendment_2, ...]
        visibleCandidates.sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime());

        // Clone records to establish explicit lineage pointers for this evaluation snapshot
        const chain: SecAccessionRecord[] = visibleCandidates.map(f => ({ ...f }));
        for (let i = 0; i < chain.length - 1; i++) {
            chain[i].supersededBy = chain[i + 1].accessionNumber;
            chain[i + 1].amends = chain[i].accessionNumber;
        }

        const originalFiling = chain[0];
        const activeFiling = chain[chain.length - 1];
        const supersededFilings = chain.slice(0, chain.length - 1);

        return {
            activeFiling,
            originalFiling,
            supersededFilings,
            fullLineageChain: chain
        };
    }

    /**
     * Determines whether a filing was accepted strictly post-market (> 16:00 US Eastern Time).
     * Correctly handles Eastern Daylight Time (EDT) and Eastern Standard Time (EST) via tz formatting.
     */
    public static isPostMarket(date: Date): boolean {
        const etString = date.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const [hStr, mStr] = etString.split(':');
        const hour = parseInt(hStr, 10);
        const minute = parseInt(mStr, 10);
        return hour > 16 || (hour === 16 && minute > 0);
    }

    /**
     * Audits discrepancies between filingDate (calendar date) and acceptedAt (timestamp).
     * Proves why filingDate cannot substitute for knowledgeTime.
     */
    public static auditFiledVsAcceptedDivergence(filings: SecAccessionRecord[]): {
        totalFilings: number;
        calendarDateMismatches: Array<{
            accessionNumber: string;
            form: string;
            filingDate: string;
            acceptanceDateTime: string;
            acceptedDateUtc: string;
        }>;
        postMarketFilings: number; // Filed after 16:00 ET
    } {
        const mismatches: any[] = [];
        let postMarketCount = 0;

        for (const f of filings) {
            const acceptedDateUtc = f.acceptedAt.toISOString().slice(0, 10);
            if (f.filingDate !== acceptedDateUtc) {
                mismatches.push({
                    accessionNumber: f.accessionNumber,
                    form: f.form,
                    filingDate: f.filingDate,
                    acceptanceDateTime: f.acceptanceDateTime,
                    acceptedDateUtc
                });
            }

            if (this.isPostMarket(f.acceptedAt)) {
                postMarketCount++;
            }
        }

        return {
            totalFilings: filings.length,
            calendarDateMismatches: mismatches,
            postMarketFilings: postMarketCount
        };
    }
}
