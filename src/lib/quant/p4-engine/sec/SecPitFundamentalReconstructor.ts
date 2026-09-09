import { SecAccessionRecord } from './SecAccessionLineageWorker';
import { SecXbrlContextClassifier, XbrlPeriodType } from './SecXbrlContextClassifier';
import { SecConceptDictionary, CanonicalConcept, ConceptMappingEntry } from './SecConceptDictionary';

export interface RawCompanyFactItem {
    taxonomy?: string;
    concept?: string;
    val: number;
    unit?: string;
    start?: string | null;
    end: string;
    instant?: string | null;
    fy?: number | null;
    fp?: string | null;
    form?: string | null;
    frame?: string | null;
    accn: string;
    filed?: string | null;
}

export interface ReconstructedFundamentalFact {
    cik: string;
    canonicalConcept: CanonicalConcept;
    value: number;
    unit: string;
    periodType: XbrlPeriodType;
    periodStartDate: string | null;
    periodEndDate: string;
    fiscalYear: number | null;
    fiscalPeriod: string | null;
    sourceAccession: string;
    sourceForm: string;
    sourceConcept: string;
    sourceTaxonomy: string;
    mappingType: string;
    priorityRank: number;
    acceptedAt: Date;
    snapshotTime: Date;
    isRestatement: boolean;
    supersededFacts: Array<{
        accession: string;
        concept: string;
        value: number;
        acceptedAt: Date;
    }>;
    provenance: {
        reason: string;
        totalCandidatesEvaluated: number;
        sameFilingAlternativesCount: number;
        priorFilingsSupersededCount: number;
    };
}

export interface ReconstructedSnapshotResult {
    cik: string;
    snapshotTime: Date;
    totalRawFactsProvided: number;
    factsEligibleAtSnapshot: number;
    reconstructedFacts: ReconstructedFundamentalFact[];
    factsByConcept: Map<CanonicalConcept, ReconstructedFundamentalFact[]>;
    rejectionAudit: {
        futureKnowledgeRejected: number;
        unknownAccessionRejected: number;
        unknownContextRejected: number;
        unmappedConceptRejected: number;
        periodTypeMismatchRejected: number;
    };
}

export class SecPitFundamentalReconstructor {
    /**
     * Reconstructs the complete point-in-time state of an issuer's fundamental facts
     * strictly at snapshotTime.
     * Guarantees 100% adherence to PIT invariants:
     * - No future knowledge (acceptedAt <= snapshotTime)
     * - Restatements are versioned and explicitly linked, never overwritten
     * - Fail-closed on missing accession lineage or context ambiguity
     * - Order-independent deterministic execution
     */
    public static reconstructSnapshot(
        cik: string,
        rawFacts: RawCompanyFactItem[],
        accessions: SecAccessionRecord[],
        snapshotTime: Date
    ): ReconstructedSnapshotResult {
        const snapshotMs = snapshotTime.getTime();
        if (isNaN(snapshotMs)) {
            throw new Error("[SecPitFundamentalReconstructor] Invalid snapshotTime provided.");
        }

        // Build accession map for instant O(1) lookup
        const accessionMap = new Map<string, SecAccessionRecord>();
        for (const acc of accessions) {
            accessionMap.set(acc.accessionNumber, acc);
        }

        const rejectionAudit = {
            futureKnowledgeRejected: 0,
            unknownAccessionRejected: 0,
            unknownContextRejected: 0,
            unmappedConceptRejected: 0,
            periodTypeMismatchRejected: 0
        };

        interface EligibleCandidate {
            raw: RawCompanyFactItem;
            accession: SecAccessionRecord;
            contextClassification: XbrlPeriodType;
            mapping: ConceptMappingEntry;
        }

        const eligibleCandidates: EligibleCandidate[] = [];

        // P0.5 FIX: Only accept facts from primary financial filing forms.
        // DEF 14A (proxy), S-1, 424B, etc. may contain XBRL facts but are NOT
        // primary financial statements — they copy/reference data from 10-K/10-Q.
        // Including them creates false "restatements" that overwrite primary data.
        const ALLOWED_FORMS = new Set([
            '10-K', '10-K/A', '10-KT', '10-KT/A',
            '10-Q', '10-Q/A', '10-QT', '10-QT/A',
            '20-F', '20-F/A',
            '40-F', '40-F/A',
            '6-K', '6-K/A',
        ]);

        for (const item of rawFacts) {
            // Gate 1: Accession lineage lookup
            const accRecord = accessionMap.get(item.accn);
            if (!accRecord) {
                rejectionAudit.unknownAccessionRejected++;
                continue;
            }

            // Gate 1b: Form type filter — only primary financial filings
            const formType = (item.form || accRecord.form || '').toUpperCase().trim();
            if (!ALLOWED_FORMS.has(formType)) {
                rejectionAudit.unknownAccessionRejected++;
                continue;
            }

            // Gate 2: Strict PIT Knowledge-time boundary check (PIT-01 & PIT-02)
            if (accRecord.acceptedAt.getTime() > snapshotMs) {
                rejectionAudit.futureKnowledgeRejected++;
                continue;
            }

            // Gate 3: Context classification (Worker 3)
            const contextRes = SecXbrlContextClassifier.classify({
                start: item.start,
                end: item.end,
                instant: item.instant,
                fy: item.fy,
                fp: item.fp,
                form: item.form || accRecord.form,
                frame: item.frame,
                accn: item.accn,
                acceptedAt: accRecord.acceptedAt
            });

            if (contextRes.classification === 'UNKNOWN') {
                rejectionAudit.unknownContextRejected++;
                continue;
            }

            // Gate 4: Concept normalization lookup (Worker 4)
            const taxonomy = item.taxonomy || 'us-gaap';
            const conceptName = item.concept;
            if (!conceptName) {
                rejectionAudit.unmappedConceptRejected++;
                continue;
            }

            const mapping = SecConceptDictionary.lookup(taxonomy, conceptName);
            if (!mapping || mapping.mappingType === 'UNSUPPORTED') {
                rejectionAudit.unmappedConceptRejected++;
                continue;
            }

            // Gate 5: PeriodType validation guard
            const periodCheck = SecConceptDictionary.validatePeriodType(mapping, contextRes.classification);
            if (!periodCheck.valid) {
                rejectionAudit.periodTypeMismatchRejected++;
                continue;
            }

            eligibleCandidates.push({
                raw: item,
                accession: accRecord,
                contextClassification: contextRes.classification,
                mapping
            });
        }

        // Partition eligible candidates by economic period and canonical concept
        // Partition Key: CIK : CanonicalConcept : PeriodType : StartDate : EndDate
        const partitions = new Map<string, EligibleCandidate[]>();

        for (const cand of eligibleCandidates) {
            const startKey = cand.contextClassification === 'INSTANT' ? '' : (cand.raw.start || '');
            const partKey = `${cand.mapping.canonicalConcept}|${cand.contextClassification}|${startKey}|${cand.raw.end}`;
            
            let list = partitions.get(partKey);
            if (!list) {
                list = [];
                partitions.set(partKey, list);
            }
            list.push(cand);
        }

        const reconstructedFacts: ReconstructedFundamentalFact[] = [];
        const factsByConcept = new Map<CanonicalConcept, ReconstructedFundamentalFact[]>();

        // Process each economic partition deterministically (Array.from for downlevel TS compatibility)
        // Sort by partition key to ensure deterministic iteration order regardless of Map internals.
        for (const [partKey, candidates] of Array.from(partitions.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
            // Group candidates by source filing accession
            const byAccession = new Map<string, EligibleCandidate[]>();
            for (const c of candidates) {
                const accn = c.accession.accessionNumber;
                let accList = byAccession.get(accn);
                if (!accList) {
                    accList = [];
                    byAccession.set(accn, accList);
                }
                accList.push(c);
            }

            // For each filing, pick the best candidate (priorityRank ASC)
            const filingWinners: Array<{
                best: EligibleCandidate;
                sameFilingCount: number;
            }> = [];

            for (const accList of Array.from(byAccession.values())) {
                // Sort candidates within the same filing by priorityRank ASC, then concept ASC
                accList.sort((a, b) => {
                    const rankDiff = a.mapping.priorityRank - b.mapping.priorityRank;
                    if (rankDiff !== 0) return rankDiff;
                    return a.raw.concept!.localeCompare(b.raw.concept!);
                });
                filingWinners.push({
                    best: accList[0],
                    sameFilingCount: accList.length
                });
            }

            // Sort filing winners chronologically by acceptedAt ASC, then accessionNumber ASC
            filingWinners.sort((a, b) => {
                const timeDiff = a.best.accession.acceptedAt.getTime() - b.best.accession.acceptedAt.getTime();
                if (timeDiff !== 0) return timeDiff;
                return a.best.accession.accessionNumber.localeCompare(b.best.accession.accessionNumber);
            });

            // The latest filing accepted on or before snapshotTime represents the active stance
            const activeWinner = filingWinners[filingWinners.length - 1];
            const isRestatement = filingWinners.length > 1;

            // Collect superseded facts from earlier filings for full audit trail
            const supersededFacts: ReconstructedFundamentalFact['supersededFacts'] = [];
            for (let i = 0; i < filingWinners.length - 1; i++) {
                const older = filingWinners[i].best;
                supersededFacts.push({
                    accession: older.accession.accessionNumber,
                    concept: older.raw.concept!,
                    value: older.raw.val,
                    acceptedAt: older.accession.acceptedAt
                });
            }

            const activeBest = activeWinner.best;
            const fact: ReconstructedFundamentalFact = {
                cik,
                canonicalConcept: activeBest.mapping.canonicalConcept,
                value: activeBest.raw.val,
                unit: activeBest.raw.unit || 'USD',
                periodType: activeBest.contextClassification,
                periodStartDate: activeBest.contextClassification === 'INSTANT' ? null : (activeBest.raw.start || null),
                periodEndDate: activeBest.raw.end,
                fiscalYear: activeBest.raw.fy ?? null,
                fiscalPeriod: activeBest.raw.fp ?? null,
                sourceAccession: activeBest.accession.accessionNumber,
                sourceForm: activeBest.accession.form,
                sourceConcept: activeBest.raw.concept!,
                sourceTaxonomy: activeBest.mapping.sourceTaxonomy,
                mappingType: activeBest.mapping.mappingType,
                priorityRank: activeBest.mapping.priorityRank,
                acceptedAt: activeBest.accession.acceptedAt,
                snapshotTime,
                isRestatement,
                supersededFacts,
                provenance: {
                    reason: isRestatement
                        ? `Restated/amended fact from ${activeBest.accession.form} (accepted ${activeBest.accession.acceptanceDateTime}), superseding ${filingWinners.length - 1} prior filing(s).`
                        : `Original filing fact from ${activeBest.accession.form} (accepted ${activeBest.accession.acceptanceDateTime}).`,
                    totalCandidatesEvaluated: candidates.length,
                    sameFilingAlternativesCount: activeWinner.sameFilingCount - 1,
                    priorFilingsSupersededCount: filingWinners.length - 1
                }
            };

            reconstructedFacts.push(fact);

            let conceptList = factsByConcept.get(fact.canonicalConcept);
            if (!conceptList) {
                conceptList = [];
                factsByConcept.set(fact.canonicalConcept, conceptList);
            }
            conceptList.push(fact);
        }

        // Deterministic sorting of final reconstructed facts:
        // canonicalConcept ASC, periodEndDate ASC, periodType ASC, sourceAccession ASC
        reconstructedFacts.sort((a, b) => {
            const cDiff = a.canonicalConcept.localeCompare(b.canonicalConcept);
            if (cDiff !== 0) return cDiff;
            const dDiff = a.periodEndDate.localeCompare(b.periodEndDate);
            if (dDiff !== 0) return dDiff;
            const pDiff = a.periodType.localeCompare(b.periodType);
            if (pDiff !== 0) return pDiff;
            return a.sourceAccession.localeCompare(b.sourceAccession);
        });

        return {
            cik,
            snapshotTime,
            totalRawFactsProvided: rawFacts.length,
            factsEligibleAtSnapshot: eligibleCandidates.length,
            reconstructedFacts,
            factsByConcept,
            rejectionAudit
        };
    }

    /**
     * Point-in-Time Fact Query Helper.
     * Extracts the single canonical fact matching period criteria.
     */
    public static queryFact(
        reconstructedFacts: ReconstructedFundamentalFact[],
        canonical: CanonicalConcept,
        periodType: XbrlPeriodType,
        periodEndDate: string
    ): ReconstructedFundamentalFact | null {
        for (const f of reconstructedFacts) {
            if (
                f.canonicalConcept === canonical &&
                f.periodType === periodType &&
                f.periodEndDate === periodEndDate
            ) {
                return f;
            }
        }
        return null;
    }
}
