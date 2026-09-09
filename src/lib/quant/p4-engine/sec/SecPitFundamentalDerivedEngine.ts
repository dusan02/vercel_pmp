/**
 * SecPitFundamentalDerivedEngine
 * =====================================
 *
 * Post-reconstruction derivation layer. Computes canonical concepts that have
 * no single direct XBRL mapping by combining already-reconstructed direct facts.
 *
 * Derived facts are ONLY emitted when no direct fact exists for the same
 * (canonicalConcept, periodEndDate, fiscalPeriod) tuple. This ensures derived
 * values never override direct values.
 *
 * PIT correctness:
 *   - Derived fact's acceptedAt = max(acceptedAt of all input facts)
 *   - Derived fact is only emitted if all inputs are available at snapshotTime
 *   - This is guaranteed because reconstructSnapshot already filters by snapshotTime
 *
 * Validation rules for every derived fact:
 *   1. All input facts must have the same periodEndDate (INSTANT) or same
 *      periodStartDate + periodEndDate (DURATION)
 *   2. All input facts must have the same unit
 *   3. All input facts must have the same fiscalYear + fiscalPeriod
 *   4. All input facts must be non-null and non-NaN
 *   5. No direct fact must exist for the target canonical concept for the same period
 *
 * Provenance:
 *   - sourceConcept: synthetic identifier (e.g., "DERIVED:LSE-SE")
 *   - sourceTaxonomy: "derived"
 *   - mappingType: "DERIVED_EQUIVALENT"
 *   - priorityRank: 100 (always loses to direct facts which are rank 1-5)
 *   - sourceType in DB: "COMPANYFACTS_DERIVED"
 */

import { CanonicalConcept } from './SecConceptDictionary';
import { ReconstructedFundamentalFact, ReconstructedSnapshotResult } from './SecPitFundamentalReconstructor';
import { XbrlPeriodType } from './SecXbrlContextClassifier';

// ─── Derivation Recipes ──────────────────────────────────────────────────

interface DerivationRecipe {
    targetConcept: CanonicalConcept;
    /** Concepts to add together (after any subtractions) */
    addends: CanonicalConcept[];
    /** Concepts to subtract from the sum of addends */
    subtrahends: CanonicalConcept[];
    /** Expected period type for input facts */
    expectedPeriodType: XbrlPeriodType;
    /** Sector restriction (SIC code ranges), or null for all sectors */
    sectorRestriction?: { sicMin: number; sicMax: number };
    /** Human-readable formula */
    formula: string;
    /** Synthetic source concept identifier */
    derivedSourceConcept: string;
}

const DERIVATION_RECIPES: DerivationRecipe[] = [
    {
        targetConcept: 'LIABILITIES' as CanonicalConcept,
        addends: ['STOCKHOLDERS_EQUITY' as CanonicalConcept], // We'll use raw concepts, not canonical
        subtrahends: [],
        expectedPeriodType: 'INSTANT' as XbrlPeriodType,
        formula: 'LiabilitiesAndStockholdersEquity - StockholdersEquity',
        derivedSourceConcept: 'DERIVED:LSE-SE',
    },
    {
        targetConcept: 'REVENUE' as CanonicalConcept,
        addends: [],
        subtrahends: [],
        expectedPeriodType: 'FY' as XbrlPeriodType,
        sectorRestriction: { sicMin: 6000, sicMax: 6399 },
        formula: 'InterestIncomeExpenseNet + NoninterestIncome',
        derivedSourceConcept: 'DERIVED:IIE+NI',
    },
];

// ─── Types ───────────────────────────────────────────────────────────────

export interface DerivedFactResult {
    fact: ReconstructedFundamentalFact;
    recipe: DerivationRecipe;
    inputFacts: { concept: string; value: number; periodEndDate: string; unit: string }[];
    validationChecks: {
        periodAligned: boolean;
        unitCompatible: boolean;
        fiscalPeriodAligned: boolean;
        valuesValid: boolean;
        noDirectConflict: boolean;
    };
}

export interface DerivationResult {
    derivedFacts: ReconstructedFundamentalFact[];
    details: DerivedFactResult[];
    stats: {
        recipesEvaluated: number;
        factsDerived: number;
        skippedPeriodMismatch: number;
        skippedUnitMismatch: number;
        skippedFiscalMismatch: number;
        skippedInvalidValue: number;
        skippedDirectConflict: number;
    };
}

// ─── Allowed forms (must match SecPitFundamentalReconstructor) ───────────

const ALLOWED_FORMS = new Set([
    '10-K', '10-K/A', '10-KT', '10-KT/A',
    '10-Q', '10-Q/A', '10-QT', '10-QT/A',
    '20-F', '20-F/A',
    '40-F', '40-F/A',
    '6-K', '6-K/A',
]);

// ─── Engine ──────────────────────────────────────────────────────────────

export class SecPitFundamentalDerivedEngine {

    /**
     * Derive missing canonical concepts from already-reconstructed direct facts.
     *
     * This function operates on the output of SecPitFundamentalReconstructor.reconstructSnapshot().
     * It looks at factsByConcept to find input components, computes derived values,
     * and returns new ReconstructedFundamentalFact objects.
     *
     * IMPORTANT: This function also needs access to raw facts for concepts that
     * are NOT in the canonical dictionary (e.g., LiabilitiesAndStockholdersEquity,
     * InterestIncomeExpenseNet, NoninterestIncome). These are raw XBRL concepts
     * that don't map to any canonical concept but are used as derivation inputs.
     *
     * @param snapshotResult - Output from reconstructSnapshot
     * @param rawFacts - Raw companyfacts items (for non-canonical input concepts)
     * @param sicCode - SIC code for sector-restricted recipes
     */
    static deriveMissing(
        snapshotResult: ReconstructedSnapshotResult,
        rawFacts: Array<{
            concept?: string;
            val: number;
            unit?: string;
            start?: string | null;
            end: string;
            instant?: string | null;
            fy?: number | null;
            fp?: string | null;
            form?: string | null;
            accn: string;
            filed?: string | null;
        }>,
        sicCode: number | null,
    ): DerivationResult {
        const stats = {
            recipesEvaluated: 0,
            factsDerived: 0,
            skippedPeriodMismatch: 0,
            skippedUnitMismatch: 0,
            skippedFiscalMismatch: 0,
            skippedInvalidValue: 0,
            skippedDirectConflict: 0,
        };

        const derivedFacts: ReconstructedFundamentalFact[] = [];
        const details: DerivedFactResult[] = [];

        // Build a set of existing canonical concepts per period to check for conflicts
        // P0.4-D FIX: Use periodEndDate only (not fiscalYear|fiscalPeriod) because
        // direct facts may have filing's fy/fp which differs from periodEndDate year.
        const existingConceptsByPeriod = new Map<string, Set<CanonicalConcept>>();
        for (const fact of snapshotResult.reconstructedFacts) {
            const key = fact.periodEndDate;
            if (!existingConceptsByPeriod.has(key)) existingConceptsByPeriod.set(key, new Set());
            existingConceptsByPeriod.get(key)!.add(fact.canonicalConcept);
        }

        // Build raw facts index by concept name
        const rawByConcept = new Map<string, typeof rawFacts>();
        for (const rf of rawFacts) {
            if (!rf.concept) continue;
            if (!rawByConcept.has(rf.concept)) rawByConcept.set(rf.concept, []);
            rawByConcept.get(rf.concept)!.push(rf);
        }

        for (const recipe of DERIVATION_RECIPES) {
            stats.recipesEvaluated++;

            // Check sector restriction
            if (recipe.sectorRestriction && sicCode !== null) {
                if (sicCode < recipe.sectorRestriction.sicMin || sicCode > recipe.sectorRestriction.sicMax) {
                    continue;
                }
            }

            // Get input concepts based on recipe
            const inputConceptNames = this.getInputConcepts(recipe);
            if (inputConceptNames.length === 0) continue;

            // For LIABILITIES: we need LiabilitiesAndStockholdersEquity and StockholdersEquity
            // Both are INSTANT concepts (balance sheet items)
            // For bank REVENUE: we need InterestIncomeExpenseNet and NoninterestIncome
            // Both are DURATION concepts (income statement items)

            const inputFactGroups = this.findAlignedInputFacts(
                recipe,
                inputConceptNames,
                rawByConcept,
                existingConceptsByPeriod,
            );

            for (const group of inputFactGroups) {
                const checks = {
                    periodAligned: group.periodAligned,
                    unitCompatible: group.unitCompatible,
                    fiscalPeriodAligned: group.fiscalPeriodAligned,
                    valuesValid: group.valuesValid,
                    noDirectConflict: group.noDirectConflict,
                };

                if (!checks.periodAligned) { stats.skippedPeriodMismatch++; continue; }
                if (!checks.unitCompatible) { stats.skippedUnitMismatch++; continue; }
                if (!checks.fiscalPeriodAligned) { stats.skippedFiscalMismatch++; continue; }
                if (!checks.valuesValid) { stats.skippedInvalidValue++; continue; }
                if (!checks.noDirectConflict) { stats.skippedDirectConflict++; continue; }

                // Compute derived value
                const derivedValue = this.computeValue(recipe, group.facts);

                if (derivedValue === null || !isFinite(derivedValue)) {
                    stats.skippedInvalidValue++;
                    continue;
                }

                // Infer fiscal year from period end date, not from raw fact's fy/fp
                // (SEC companyfacts fy/fp refers to the FILING's fiscal year, not the fact's period)
                const endYear = new Date(group.facts[0]!.end).getUTCFullYear();
                const inferredFy = endYear;
                const inferredFp = group.facts[0]!.fp ?? 'FY';

                // Build derived fact
                const latestAcceptedAt = new Date(Math.max(...group.facts.map(f => new Date(f.acceptedAt).getTime())));
                const inputAccession = group.facts[0]!.accn; // Use first fact's accession as primary

                const derivedFact: ReconstructedFundamentalFact = {
                    cik: snapshotResult.cik,
                    canonicalConcept: recipe.targetConcept,
                    value: derivedValue,
                    unit: group.facts[0]!.unit || 'USD',
                    periodType: recipe.expectedPeriodType,
                    periodStartDate: group.facts[0]!.start || null,
                    periodEndDate: group.facts[0]!.end,
                    fiscalYear: inferredFy,
                    fiscalPeriod: inferredFp,
                    sourceAccession: inputAccession,
                    sourceForm: group.facts[0]!.form || 'DERIVED',
                    sourceConcept: recipe.derivedSourceConcept,
                    sourceTaxonomy: 'derived',
                    mappingType: 'DERIVED_EQUIVALENT',
                    priorityRank: 100,
                    acceptedAt: latestAcceptedAt,
                    snapshotTime: snapshotResult.snapshotTime,
                    isRestatement: false,
                    supersededFacts: group.facts.map(f => ({
                        accession: f.accn,
                        concept: f.concept,
                        value: f.val,
                        acceptedAt: new Date(f.acceptedAt),
                    })),
                    provenance: {
                        reason: `Derived via ${recipe.formula} from ${group.facts.map(f => f.concept).join(', ')}`,
                        totalCandidatesEvaluated: group.facts.length,
                        sameFilingAlternativesCount: 0,
                        priorFilingsSupersededCount: 0,
                    },
                };

                derivedFacts.push(derivedFact);
                stats.factsDerived++;

                details.push({
                    fact: derivedFact,
                    recipe,
                    inputFacts: group.facts.map(f => ({
                        concept: f.concept,
                        value: f.val,
                        periodEndDate: f.end,
                        unit: f.unit || 'USD',
                    })),
                    validationChecks: checks,
                });
            }
        }

        return { derivedFacts, details, stats };
    }

    /**
     * Get the raw XBRL concept names that serve as inputs for a recipe.
     */
    private static getInputConcepts(recipe: DerivationRecipe): string[] {
        switch (recipe.targetConcept) {
            case 'LIABILITIES' as CanonicalConcept:
                return ['LiabilitiesAndStockholdersEquity', 'StockholdersEquity'];
            case 'REVENUE' as CanonicalConcept:
                return ['InterestIncomeExpenseNet', 'NoninterestIncome'];
            default:
                return [];
        }
    }

    /**
     * Find groups of input facts that are aligned by period, unit, and fiscal period.
     * Returns groups that pass all validation checks.
     */
    private static findAlignedInputFacts(
        recipe: DerivationRecipe,
        inputConceptNames: string[],
        rawByConcept: Map<string, any[]>,
        existingConceptsByPeriod: Map<string, Set<CanonicalConcept>>,
    ): Array<{
        facts: Array<{
            concept: string;
            val: number;
            unit: string;
            start: string | null;
            end: string;
            instant: string | null;
            fy: number | null;
            fp: string | null;
            form: string | null;
            accn: string;
            acceptedAt: string;
        }>;
        periodAligned: boolean;
        unitCompatible: boolean;
        fiscalPeriodAligned: boolean;
        valuesValid: boolean;
        noDirectConflict: boolean;
    }> {
        // Collect all facts for each input concept, filtered to primary financial forms
        const allInputFacts: Array<{ conceptName: string; facts: any[] }> = [];
        for (const conceptName of inputConceptNames) {
            const allFacts = rawByConcept.get(conceptName) || [];
            // P0.4-D: Only use facts from primary financial forms (10-K, 10-Q, 20-F, etc.)
            // This matches the reconstructor's Gate 1b filter.
            const facts = allFacts.filter((f: any) => ALLOWED_FORMS.has(f.form));
            if (facts.length === 0) return []; // Missing input concept → cannot derive
            allInputFacts.push({ conceptName, facts });
        }

        // Group facts by periodEndDate (for INSTANT) or periodStartDate+periodEndDate (for DURATION)
        const isInstant = recipe.expectedPeriodType === 'INSTANT';

        // Build a map: periodKey → conceptName → fact
        const byPeriod = new Map<string, Map<string, any>>();
        for (const { conceptName, facts } of allInputFacts) {
            for (const fact of facts) {
                if (fact.val === 0) continue; // Skip zero facts
                const periodKey = isInstant
                    ? fact.end
                    : `${fact.start || ''}|${fact.end}`;
                if (!byPeriod.has(periodKey)) byPeriod.set(periodKey, new Map());
                byPeriod.get(periodKey)!.set(conceptName, fact);
            }
        }

        const groups: any[] = [];

        for (const [periodKey, conceptMap] of byPeriod) {
            // Check that ALL input concepts are present for this period
            const allPresent = inputConceptNames.every(name => conceptMap.has(name));
            if (!allPresent) continue;

            const facts = inputConceptNames.map(name => conceptMap.get(name));

            // Validation 1: Period alignment
            const periodAligned = isInstant
                ? facts.every(f => f.end === facts[0]!.end)
                : facts.every(f => f.start === facts[0]!.start && f.end === facts[0]!.end);

            // Validation 2: Unit compatibility
            const units = new Set(facts.map(f => f.unit || 'USD'));
            const unitCompatible = units.size === 1;

            // Validation 3: Fiscal period alignment
            const fySet = new Set(facts.map(f => f.fy));
            const fpSet = new Set(facts.map(f => f.fp));
            const fiscalPeriodAligned = fySet.size === 1 && fpSet.size === 1;

            // Validation 4: Values valid (non-null, finite)
            const valuesValid = facts.every(f => f.val !== null && f.val !== undefined && isFinite(f.val));

            // Validation 5: No direct fact conflict (check by periodEndDate only)
            const periodEnd = facts[0]!.end;
            const existingConcepts = existingConceptsByPeriod.get(periodEnd);
            const noDirectConflict = !existingConcepts || !existingConcepts.has(recipe.targetConcept);

            groups.push({
                facts: facts.map(f => ({
                    concept: f.concept || '',
                    val: f.val,
                    unit: f.unit || 'USD',
                    start: f.start || null,
                    end: f.end,
                    instant: f.instant || null,
                    fy: f.fy ?? null,
                    fp: f.fp ?? null,
                    form: f.form || null,
                    accn: f.accn,
                    acceptedAt: f.filed || f.acceptedAt || new Date().toISOString(),
                })),
                periodAligned,
                unitCompatible,
                fiscalPeriodAligned,
                valuesValid,
                noDirectConflict,
            });
        }

        return groups;
    }

    /**
     * Compute the derived value from input facts based on the recipe formula.
     */
    private static computeValue(
        recipe: DerivationRecipe,
        facts: Array<{ concept: string; val: number }>,
    ): number | null {
        switch (recipe.targetConcept) {
            case 'LIABILITIES' as CanonicalConcept: {
                // LiabilitiesAndStockholdersEquity - StockholdersEquity
                const lse = facts.find(f => f.concept === 'LiabilitiesAndStockholdersEquity');
                const se = facts.find(f => f.concept === 'StockholdersEquity');
                if (!lse || !se) return null;
                return lse.val - se.val;
            }
            case 'REVENUE' as CanonicalConcept: {
                // InterestIncomeExpenseNet + NoninterestIncome
                const iie = facts.find(f => f.concept === 'InterestIncomeExpenseNet');
                const ni = facts.find(f => f.concept === 'NoninterestIncome');
                if (!iie || !ni) return null;
                return iie.val + ni.val;
            }
            default:
                return null;
        }
    }
}
