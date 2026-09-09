/**
 * SecXbrlValidationLayer
 * ======================
 *
 * P0.2: Evidence-based validation of XBRL facts.
 *
 * CRITICAL PRINCIPLES (enforced by design):
 * 1. `decimals` is PRECISION metadata, NEVER a unit multiplier
 *    - decimals="-6" → value rounded to millions (val is in dollars)
 *    - decimals="2"  → value precise to 2 decimal places (normal for EPS)
 *    - decimals="6"  → value precise to 6 decimal places (suspicious for large currency values)
 * 2. NO automatic unit conversion based on decimals
 *    - Never multiply val by 10^|decimals|
 *    - Never apply "if decimals > 0 then val *= 1M" heuristic
 * 3. Magnitude is a DQ SIGNAL, never a value transformation
 *    - A currency value < $100K for a public company is SUSPICIOUS_MAGNITUDE
 *    - But we do NOT auto-correct it — we flag it and let the resolver decide
 * 4. UNKNOWN facts are NOT silently marked as VERIFIED
 *    - If XBRL metadata is unavailable, classification is XBRL_METADATA_UNAVAILABLE
 *    - This is distinct from VERIFIED and from any error class
 *
 * Validation types:
 *   VERIFIED                    — XBRL metadata confirms value is consistent
 *   UNIT_INCONSISTENCY          — unitRef doesn't match expected unit family for concept
 *   CONCEPT_UNIT_MISMATCH       — concept is CURRENCY but unit is SHARES/PER_SHARE
 *   PERIOD_CONTEXT_MISMATCH     — context period doesn't match expected period
 *   CONCEPT_CONFLICT            — multiple concepts map to same canonical, different values
 *   SUSPICIOUS_MAGNITUDE        — value magnitude is economically implausible
 *   ZERO_PRIMARY_CONCEPT        — primary concept (revenue, etc.) has val=0 but alternative concept has non-zero
 *   XBRL_METADATA_ANOMALY       — decimals attribute is economically inconsistent (e.g., decimals=6 for $4B revenue)
 *   XBRL_METADATA_UNAVAILABLE   — no XBRL XML available to verify (UNKNOWN)
 */

import { XbrlFact, XbrlContext, XbrlUnit, XbrlFilingEvidence } from './SecXbrlFactExtractor';
import { SecConceptDictionary, CanonicalConcept, ConceptMappingEntry } from './SecConceptDictionary';

// ─── Types ───────────────────────────────────────────────────────────────

export type ValidationVerdict =
    | 'VERIFIED'
    | 'UNIT_INCONSISTENCY'
    | 'CONCEPT_UNIT_MISMATCH'
    | 'PERIOD_CONTEXT_MISMATCH'
    | 'CONCEPT_CONFLICT'
    | 'SUSPICIOUS_MAGNITUDE'
    | 'ZERO_PRIMARY_CONCEPT'
    | 'XBRL_METADATA_ANOMALY'
    | 'XBRL_METADATA_UNAVAILABLE';

export type UnitFamily = 'CURRENCY' | 'PER_SHARE' | 'SHARES' | 'PURE' | 'UNKNOWN';

export interface ConceptCandidate {
    // From companyfacts JSON
    concept: string;           // XBRL concept name (e.g., "Revenues")
    val: number;               // numeric value
    accn: string;              // accession number
    start: string | null;      // period start
    end: string;               // period end
    fy: number | null;         // fiscal year
    fp: string | null;         // fiscal period
    form: string | null;       // form type

    // From SecConceptDictionary
    canonicalConcept: CanonicalConcept;
    mappingType: string;       // EXACT, ALIAS, etc.
    priorityRank: number;      // 1 = highest priority
    expectedUnitFamily: UnitFamily;

    // From XBRL XML (if available)
    xbrlDecimals: string | null;
    xbrlUnitRef: string | null;
    xbrlUnitFamily: UnitFamily | null;
    xbrlContextId: string | null;
    xbrlContextPeriodMatch: boolean | null;
    xbrlId: string | null;

    // Validation
    verdict: ValidationVerdict;
    verdictReason: string;
}

export interface CanonicalResolution {
    canonicalConcept: CanonicalConcept;
    candidates: ConceptCandidate[];
    selectedCandidate: ConceptCandidate | null;
    selectionReason: string;
    conflicts: string[];
}

// ─── Expected unit family per canonical concept ──────────────────────────

export const CANONICAL_UNIT_FAMILY: Record<CanonicalConcept, UnitFamily> = {
    REVENUE: 'CURRENCY',
    COST_OF_REVENUE: 'CURRENCY',
    GROSS_PROFIT: 'CURRENCY',
    OPERATING_EXPENSES: 'CURRENCY',
    OPERATING_INCOME: 'CURRENCY',
    NET_INCOME: 'CURRENCY',
    EPS_DILUTED: 'PER_SHARE',
    EPS_BASIC: 'PER_SHARE',
    SHARES_DILUTED: 'SHARES',
    SHARES_BASIC: 'SHARES',
    ASSETS: 'CURRENCY',
    ASSETS_CURRENT: 'CURRENCY',
    LIABILITIES: 'CURRENCY',
    LIABILITIES_CURRENT: 'CURRENCY',
    CASH_AND_EQUIVALENTS: 'CURRENCY',
    TOTAL_DEBT: 'CURRENCY',
    STOCKHOLDERS_EQUITY: 'CURRENCY',
    OPERATING_CASH_FLOW: 'CURRENCY',
    CAPITAL_EXPENDITURES: 'CURRENCY',
    FREE_CASH_FLOW_REPORTED: 'CURRENCY',
};

// ─── Magnitude bounds (DQ signals only, NOT transformations) ─────────────

const MAGNITUDE_BOUNDS: Record<UnitFamily, { min: number; max: number }> = {
    CURRENCY: { min: 100_000, max: 5_000_000_000_000 },  // $100K to $5T
    PER_SHARE: { min: -1000, max: 1000 },                 // -$1000 to $1000 per share
    SHARES: { min: 1_000, max: 1_000_000_000_000 },      // 1K to 1T shares
    PURE: { min: -100, max: 100 },                        // -100 to 100 (percent)
    UNKNOWN: { min: -Infinity, max: Infinity },
};

// ─── Validation functions ────────────────────────────────────────────────

/**
 * Resolve unit family from XBRL unitRef.
 */
export function resolveUnitFamilyFromXbrl(
    unitRef: string | null,
    units: Map<string, XbrlUnit>
): UnitFamily {
    if (!unitRef) return 'UNKNOWN';
    const unit = units.get(unitRef);
    if (!unit) return 'UNKNOWN';

    if (unit.numerator && unit.denominator) {
        if (unit.numerator.includes('USD') && unit.denominator.includes('shares')) return 'PER_SHARE';
        return 'UNKNOWN';
    }
    if (unit.measure?.includes('USD') || unit.measure?.includes('iso4217')) return 'CURRENCY';
    if (unit.measure?.includes('shares')) return 'SHARES';
    if (unit.measure?.includes('pure') || unit.measure?.includes('num')) return 'PURE';
    return 'UNKNOWN';
}

/**
 * Check if XBRL context period matches expected period.
 */
export function contextPeriodMatches(
    ctx: XbrlContext | undefined,
    expectedStart: string | null,
    expectedEnd: string
): boolean {
    if (!ctx) return false;

    // For duration facts: check start and end
    if (expectedStart && ctx.startDate && ctx.endDate) {
        return ctx.startDate === expectedStart && ctx.endDate === expectedEnd;
    }

    // For instant facts: check instant matches end
    if (!expectedStart && ctx.instant) {
        return ctx.instant === expectedEnd;
    }

    // Fallback: check if end date matches
    if (ctx.endDate === expectedEnd) return true;
    if (ctx.instant === expectedEnd) return true;

    return false;
}

/**
 * Check if decimals attribute is economically consistent for a given unit family and value.
 *
 * XBRL decimals semantics:
 *   decimals="-6" → rounded to millions (normal for large currency values)
 *   decimals="-3" → rounded to thousands
 *   decimals="0"  → exact in whole units
 *   decimals="2"  → precise to 2 decimal places (normal for EPS)
 *   decimals="6"  → precise to 6 decimal places (SUSPICIOUS for large currency values)
 *
 * This function does NOT convert values. It only flags metadata anomalies.
 */
export function checkDecimalsConsistency(
    decimals: string | null,
    val: number,
    unitFamily: UnitFamily
): { isAnomaly: boolean; reason: string } {
    if (decimals === null) return { isAnomaly: false, reason: 'no decimals attribute' };
    if (decimals === 'INF') return { isAnomaly: false, reason: 'exact value (INF)' };

    const d = parseInt(decimals);
    if (isNaN(d)) return { isAnomaly: false, reason: `unparseable decimals: ${decimals}` };

    // For PER_SHARE: decimals > 0 is NORMAL (EPS to 2 decimal places)
    if (unitFamily === 'PER_SHARE') {
        if (d > 0 && d <= 4) return { isAnomaly: false, reason: `decimals=${d} is normal for per-share values` };
        if (d < 0) return { isAnomaly: true, reason: `decimals=${d} (negative) is unusual for per-share values` };
        return { isAnomaly: false, reason: `decimals=${d} acceptable for per-share` };
    }

    // For CURRENCY: decimals > 0 with large absolute value is SUSPICIOUS
    // But decimals > 0 with small value (e.g., val=0.05) could be legitimate
    if (unitFamily === 'CURRENCY') {
        if (d > 0 && Math.abs(val) > 1000) {
            // val > 1000 with decimals > 0 means the value is "precise to N decimal places"
            // but the magnitude suggests it should be in millions/billions
            // This is the LUV pattern: val=4136, decimals=6 → claims $4,136.000000
            return {
                isAnomaly: true,
                reason: `decimals=${d} (positive) with |val|=${Math.abs(val)} > 1000 — economically inconsistent for currency (suggests value may be in millions but reported with wrong precision)`,
            };
        }
        if (d < 0) {
            // Negative decimals is normal for large currency values (rounded to 10^|d|)
            return { isAnomaly: false, reason: `decimals=${d} (negative) — rounded to 10^${Math.abs(d)}` };
        }
        return { isAnomaly: false, reason: `decimals=${d} — acceptable for currency` };
    }

    // For SHARES: similar to currency
    if (unitFamily === 'SHARES') {
        if (d > 0 && Math.abs(val) > 1000) {
            return {
                isAnomaly: true,
                reason: `decimals=${d} (positive) with |val|=${Math.abs(val)} > 1000 — suspicious for share count`,
            };
        }
        return { isAnomaly: false, reason: `decimals=${d} — acceptable for shares` };
    }

    return { isAnomaly: false, reason: `decimals=${d} — no specific check for unit family ${unitFamily}` };
}

/**
 * Check if value magnitude is economically plausible.
 * Returns a DQ signal — does NOT transform the value.
 */
export function checkMagnitude(
    val: number,
    unitFamily: UnitFamily
): { isSuspicious: boolean; reason: string } {
    const bounds = MAGNITUDE_BOUNDS[unitFamily] || MAGNITUDE_BOUNDS.UNKNOWN;
    const absVal = Math.abs(val);

    if (val === 0) {
        // Zero is handled separately (ZERO_PRIMARY_CONCEPT)
        return { isSuspicious: false, reason: 'val=0 (checked separately)' };
    }

    if (absVal < bounds.min) {
        return {
            isSuspicious: true,
            reason: `|val|=${absVal} < min reasonable ${bounds.min} for ${unitFamily}`,
        };
    }

    if (absVal > bounds.max) {
        return {
            isSuspicious: true,
            reason: `|val|=${absVal} > max reasonable ${bounds.max} for ${unitFamily}`,
        };
    }

    return { isSuspicious: false, reason: `magnitude within bounds for ${unitFamily}` };
}

// ─── Candidate validation ────────────────────────────────────────────────

/**
 * Validate a single concept candidate against XBRL evidence.
 */
export function validateCandidate(
    candidate: Omit<ConceptCandidate, 'verdict' | 'verdictReason'>,
    xbrlEvidence: XbrlFilingEvidence | null
): ConceptCandidate {
    const verdicts: string[] = [];
    let primaryVerdict: ValidationVerdict = 'VERIFIED';

    // 1. Check if XBRL evidence is available
    if (!xbrlEvidence) {
        return {
            ...candidate,
            verdict: 'XBRL_METADATA_UNAVAILABLE',
            verdictReason: 'No XBRL XML available for this accession — cannot verify unit/decimals/context',
        };
    }

    // 2. Find matching XBRL fact
    const matchingXbrl = xbrlEvidence.facts.filter(xf => {
        if (xf.numericValue !== candidate.val) return false;
        const ctx = xf.context;
        if (!ctx) return false;
        // Skip dimensioned facts (segmented data)
        if (ctx.dimensionMembers && ctx.dimensionMembers.size > 0) return false;
        // Check period
        return contextPeriodMatches(ctx, candidate.start, candidate.end);
    });

    if (matchingXbrl.length === 0) {
        // Try matching by value only (period might differ slightly)
        const valueMatch = xbrlEvidence.facts.filter(xf => {
            if (xf.numericValue !== candidate.val) return false;
            const ctx = xf.context;
            if (!ctx) return false;
            if (ctx.dimensionMembers && ctx.dimensionMembers.size > 0) return false;
            return true;
        });

        if (valueMatch.length === 0) {
            return {
                ...candidate,
                xbrlDecimals: null,
                xbrlUnitRef: null,
                xbrlUnitFamily: null,
                xbrlContextId: null,
                xbrlContextPeriodMatch: null,
                xbrlId: null,
                verdict: 'XBRL_METADATA_UNAVAILABLE',
                verdictReason: `No XBRL fact found matching concept=${candidate.concept}, val=${candidate.val}, end=${candidate.end}`,
            };
        }

        // Use value match but flag period mismatch
        const xfact = valueMatch[0]!;
        const xbrlUnitFamily = resolveUnitFamilyFromXbrl(xfact.unitRef, xbrlEvidence.units);
        const periodMatch = contextPeriodMatches(xfact.context, candidate.start, candidate.end);

        const result: ConceptCandidate = {
            ...candidate,
            xbrlDecimals: xfact.decimals,
            xbrlUnitRef: xfact.unitRef,
            xbrlUnitFamily,
            xbrlContextId: xfact.contextRef,
            xbrlContextPeriodMatch: periodMatch,
            xbrlId: xfact.id || null,
            verdict: 'PERIOD_CONTEXT_MISMATCH',
            verdictReason: `XBRL fact found by value match but period doesn't match exactly (cf: start=${candidate.start}, end=${candidate.end}; xbrl: start=${xfact.context?.startDate}, end=${xfact.context?.endDate}, instant=${xfact.context?.instant})`,
        };

        // Still run other checks
        return validateUnitAndDecimals(result, xbrlEvidence);
    }

    // 3. Use the first matching XBRL fact
    const xfact = matchingXbrl[0]!;
    const xbrlUnitFamily = resolveUnitFamilyFromXbrl(xfact.unitRef, xbrlEvidence.units);
    const periodMatch = contextPeriodMatches(xfact.context, candidate.start, candidate.end);

    const result: ConceptCandidate = {
        ...candidate,
        xbrlDecimals: xfact.decimals,
        xbrlUnitRef: xfact.unitRef,
        xbrlUnitFamily,
        xbrlContextId: xfact.contextRef,
        xbrlContextPeriodMatch: periodMatch,
        xbrlId: xfact.id || null,
        verdict: 'VERIFIED',
        verdictReason: 'XBRL metadata matches',
    };

    return validateUnitAndDecimals(result, xbrlEvidence);
}

/**
 * Run unit and decimals checks on a validated candidate.
 */
function validateUnitAndDecimals(
    candidate: ConceptCandidate,
    xbrlEvidence: XbrlFilingEvidence
): ConceptCandidate {
    const reasons: string[] = [candidate.verdictReason];
    let verdict: ValidationVerdict = candidate.verdict;

    // Check unit family match
    if (candidate.xbrlUnitFamily && candidate.xbrlUnitFamily !== 'UNKNOWN') {
        if (candidate.xbrlUnitFamily !== candidate.expectedUnitFamily) {
            verdict = 'CONCEPT_UNIT_MISMATCH';
            reasons.push(`unit family mismatch: expected ${candidate.expectedUnitFamily}, got ${candidate.xbrlUnitFamily}`);
        }
    }

    // Check decimals consistency (NOT a conversion — just a flag)
    if (candidate.xbrlDecimals !== null && candidate.xbrlUnitFamily) {
        const decimalsCheck = checkDecimalsConsistency(
            candidate.xbrlDecimals,
            candidate.val,
            candidate.xbrlUnitFamily
        );
        if (decimalsCheck.isAnomaly) {
            // Only override VERIFIED — don't downgrade worse verdicts
            if (verdict === 'VERIFIED') {
                verdict = 'XBRL_METADATA_ANOMALY';
            }
            reasons.push(`decimals anomaly: ${decimalsCheck.reason}`);
        }
    }

    // Check magnitude (DQ signal only)
    const magnitudeCheck = checkMagnitude(candidate.val, candidate.expectedUnitFamily);
    if (magnitudeCheck.isSuspicious) {
        if (verdict === 'VERIFIED') {
            verdict = 'SUSPICIOUS_MAGNITUDE';
        }
        reasons.push(`magnitude: ${magnitudeCheck.reason}`);
    }

    return {
        ...candidate,
        verdict,
        verdictReason: reasons.join('; '),
    };
}

// ─── Concept Resolver ────────────────────────────────────────────────────

/**
 * Resolve the best candidate for a canonical concept from multiple XBRL concepts.
 *
 * Selection priority (in order):
 * 1. CONCEPT_COMPATIBILITY: concept must map to the canonical concept
 * 2. UNIT_COMPATIBILITY: unit family must match expected
 * 3. PERIOD_CONTEXT_COMPATIBILITY: XBRL context period must match
 * 4. CONCEPT_PRIORITY: lower priorityRank = higher priority (Rank 1 > Rank 3)
 * 5. ECONOMIC_VALIDITY: non-zero preferred over zero (but only after above checks)
 * 6. FILING_CONSISTENCY: prefer the filing that reported this as current period
 * 7. XBRL_METADATA_QUALITY: prefer facts with consistent decimals
 *
 * CRITICAL: NEVER select based solely on "nonZero > zero" without respecting
 * concept priority and filing/context evidence.
 */
export function resolveConcept(
    canonicalConcept: CanonicalConcept,
    candidates: ConceptCandidate[]
): CanonicalResolution {
    const conflicts: string[] = [];
    const expectedUnitFamily = CANONICAL_UNIT_FAMILY[canonicalConcept];

    if (candidates.length === 0) {
        return {
            canonicalConcept,
            candidates: [],
            selectedCandidate: null,
            selectionReason: 'No candidates available',
            conflicts: ['No candidates provided'],
        };
    }

    // Step 1: Filter by concept compatibility (all should pass — they're already mapped)
    const conceptCompatible = candidates.filter(c => c.canonicalConcept === canonicalConcept);
    if (conceptCompatible.length === 0) {
        conflicts.push(`No candidates map to ${canonicalConcept}`);
        return {
            canonicalConcept,
            candidates,
            selectedCandidate: null,
            selectionReason: 'No concept-compatible candidates',
            conflicts,
        };
    }

    // Step 2: Filter by unit compatibility
    const unitCompatible = conceptCompatible.filter(c => {
        if (c.xbrlUnitFamily === null || c.xbrlUnitFamily === 'UNKNOWN') return true; // Can't verify — keep
        return c.xbrlUnitFamily === expectedUnitFamily;
    });
    if (unitCompatible.length === 0) {
        // No unit-compatible candidates — keep all and flag conflict
        conflicts.push(`No candidates with unit family ${expectedUnitFamily} — using all ${conceptCompatible.length}`);
    }

    // Step 3: Filter by period/context compatibility
    const periodCompatible = (unitCompatible.length > 0 ? unitCompatible : conceptCompatible).filter(c => {
        if (c.xbrlContextPeriodMatch === null) return true; // Can't verify — keep
        return c.xbrlContextPeriodMatch === true;
    });
    if (periodCompatible.length === 0) {
        conflicts.push(`No candidates with matching period context — using best available`);
    }

    // Step 4: Sort by concept priority (lower rank = higher priority)
    const pool = periodCompatible.length > 0 ? periodCompatible : (unitCompatible.length > 0 ? unitCompatible : conceptCompatible);
    const sorted = [...pool].sort((a, b) => a.priorityRank - b.priorityRank);

    // Step 5: Among same-priority candidates, prefer non-zero (but only after concept/unit/period checks)
    // Group by priorityRank
    const byPriority = new Map<number, ConceptCandidate[]>();
    for (const c of sorted) {
        if (!byPriority.has(c.priorityRank)) byPriority.set(c.priorityRank, []);
        byPriority.get(c.priorityRank)!.push(c);
    }

    // Get the highest priority group (lowest rank number)
    const highestPriority = Math.min(...byPriority.keys());
    const highestPriorityCandidates = byPriority.get(highestPriority)!;

    let selected: ConceptCandidate;
    let selectionReason: string;

    if (highestPriorityCandidates.length === 1) {
        selected = highestPriorityCandidates[0]!;
        selectionReason = `Selected by concept priority (rank ${highestPriority}), unit compatibility, period compatibility — single candidate`;
    } else {
        // Multiple candidates at same priority — apply economic validity
        const nonZero = highestPriorityCandidates.filter(c => c.val !== 0);
        const zero = highestPriorityCandidates.filter(c => c.val === 0);

        if (nonZero.length === 1) {
            selected = nonZero[0]!;
            selectionReason = `Selected by concept priority (rank ${highestPriority}), unit+period compatibility, non-zero value (among ${highestPriorityCandidates.length} candidates)`;
        } else if (nonZero.length > 1) {
            // Multiple non-zero at same priority — prefer VERIFIED over SUSPICIOUS/ANOMALY
            const verified = nonZero.filter(c => c.verdict === 'VERIFIED');
            if (verified.length === 1) {
                selected = verified[0]!;
                selectionReason = `Selected by concept priority (rank ${highestPriority}), unit+period compatibility, non-zero, VERIFIED metadata`;
            } else if (verified.length > 1) {
                // Still tied — pick first (deterministic by sort order)
                selected = verified[0]!;
                selectionReason = `Selected by concept priority (rank ${highestPriority}), unit+period compatibility, non-zero, VERIFIED — first of ${verified.length} tied candidates`;
                conflicts.push(`${verified.length} VERIFIED non-zero candidates at rank ${highestPriority} — ambiguous`);
            } else {
                // No VERIFIED — pick first non-zero
                selected = nonZero[0]!;
                selectionReason = `Selected by concept priority (rank ${highestPriority}), unit+period compatibility, non-zero — first of ${nonZero.length} (none VERIFIED)`;
                conflicts.push(`${nonZero.length} non-zero candidates at rank ${highestPriority}, none VERIFIED — ambiguous`);
            }
        } else {
            // All zero at this priority — check if lower priority has non-zero
            const lowerPriorityNonZero = sorted.filter(c => c.priorityRank > highestPriority && c.val !== 0);
            if (lowerPriorityNonZero.length > 0) {
                // This is the SOV pattern: Rank 3 has zero, Rank 1 has non-zero
                // Wait — Rank 1 is HIGHER priority. If Rank 3 has zero and Rank 1 has non-zero,
                // Rank 1 should have been selected first.
                // But if we're here, it means Rank 1 was filtered out by unit/period incompatibility.
                // In that case, we should flag the conflict but still prefer non-zero from lower priority.

                // Actually, re-check: the SOV case is that BOTH concepts exist but
                // Revenues (Rank 3) = 0 and RevenueFromContractWithCustomerExcludingAssessedTax (Rank 1) = $174M
                // If Rank 1 was in the candidates, it should have been selected at Step 4.
                // The issue is that the reconstructor might not have included Rank 1 as a candidate.

                // For the resolver: if all highest-priority candidates are zero,
                // and lower-priority has non-zero, flag as CONCEPT_CONFLICT
                selected = highestPriorityCandidates[0]!; // Keep the zero (don't auto-substitute)
                selectionReason = `Selected by concept priority (rank ${highestPriority}) — but val=0. ${lowerPriorityNonZero.length} lower-priority candidates have non-zero values (CONFLICT)`;
                conflicts.push(`ZERO_PRIMARY_CONFLICT: rank ${highestPriority} has val=0, but rank ${lowerPriorityNonZero[0]!.priorityRank} has val=${lowerPriorityNonZero[0]!.val} (${lowerPriorityNonZero[0]!.concept})`);
            } else {
                // All candidates are zero
                selected = highestPriorityCandidates[0]!;
                selectionReason = `Selected by concept priority (rank ${highestPriority}) — all candidates have val=0`;
            }
        }
    }

    // Check for value conflicts across different concepts
    const nonZeroValues = new Set(candidates.filter(c => c.val !== 0).map(c => c.val));
    if (nonZeroValues.size > 1) {
        conflicts.push(`CONCEPT_CONFLICT: ${nonZeroValues.size} distinct non-zero values across candidates: ${[...nonZeroValues].slice(0, 5).join(', ')}`);
    }

    return {
        canonicalConcept,
        candidates,
        selectedCandidate: selected,
        selectionReason,
        conflicts,
    };
}

// ─── Build candidates from companyfacts + XBRL evidence ──────────────────

/**
 * Build concept candidates for a given CIK, canonical concept, and period.
 * Combines companyfacts JSON data with XBRL XML evidence.
 */
export function buildCandidates(
    canonicalConcept: CanonicalConcept,
    cfFacts: Array<{
        concept: string;
        val: number;
        accn: string;
        start: string | null;
        end: string;
        fy: number | null;
        fp: string | null;
        form: string | null;
    }>,
    xbrlEvidenceByAccession: Map<string, XbrlFilingEvidence>
): ConceptCandidate[] {
    const candidates: ConceptCandidate[] = [];

    for (const cf of cfFacts) {
        // Look up concept mapping
        const mapping = SecConceptDictionary.lookup('us-gaap', cf.concept);
        if (!mapping || mapping.mappingType === 'UNSUPPORTED') continue;
        if (mapping.canonicalConcept !== canonicalConcept) continue;

        const expectedUnitFamily = CANONICAL_UNIT_FAMILY[canonicalConcept];
        const xbrlEvidence = xbrlEvidenceByAccession.get(cf.accn) || null;

        const partial: Omit<ConceptCandidate, 'verdict' | 'verdictReason'> = {
            concept: cf.concept,
            val: cf.val,
            accn: cf.accn,
            start: cf.start,
            end: cf.end,
            fy: cf.fy,
            fp: cf.fp,
            form: cf.form,
            canonicalConcept: mapping.canonicalConcept,
            mappingType: mapping.mappingType,
            priorityRank: mapping.priorityRank,
            expectedUnitFamily,
            xbrlDecimals: null,
            xbrlUnitRef: null,
            xbrlUnitFamily: null,
            xbrlContextId: null,
            xbrlContextPeriodMatch: null,
            xbrlId: null,
        };

        const validated = validateCandidate(partial, xbrlEvidence);
        candidates.push(validated);
    }

    return candidates;
}
