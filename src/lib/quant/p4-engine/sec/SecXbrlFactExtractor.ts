/**
 * SecXbrlFactExtractor
 * ====================
 *
 * Extracts raw XBRL fact metadata from SEC filing XML documents.
 *
 * SEC companyfacts JSON API provides fact values but NOT the `decimals` attribute.
 * The `decimals` attribute is only available in the raw XBRL XML document for each filing.
 *
 * This module:
 * 1. Downloads XBRL XML for a given accession number
 * 2. Parses all numeric facts with their metadata:
 *    - concept (XBRL tag)
 *    - rawValue (the numeric value as reported)
 *    - decimals (precision attribute: -6 = rounded to millions, 6 = precise to 6 decimal places)
 *    - unitRef (unit reference: USD, USD/shares, shares, etc.)
 *    - contextRef (context ID for period/entity matching)
 * 3. Parses all contexts to extract period information (startDate, endDate, instant)
 * 4. Returns a structured evidence layer for each fact
 *
 * XBRL decimals semantics (per XBRL spec):
 *   decimals="-6" → value is rounded to 10^6 = millions. val=4616000000 means $4,616,000,000
 *   decimals="0"  → value is in whole units. val=4616000000 means $4,616,000,000
 *   decimals="6"  → value is precise to 6 decimal places. val=4136 means $4,136.000000
 *   decimals="INF"→ value is exact
 *
 * IMPORTANT: decimals gives PRECISION, not unit scale.
 *   - Do NOT auto-multiply val by 10^|decimals| when decimals > 0
 *   - Instead: use decimals to detect economically inconsistent facts
 *   - A fact with decimals="6" and val=4136 for a major airline revenue is economically absurd
 *     but XBRL-spec-legal. The correct approach is to flag it as SUSPICIOUS and prefer
 *     an equivalent fact from the filing chain with consistent precision.
 */

import * as fs from 'fs';
import * as path from 'path';

const SEC_USER_AGENT = 'PMP EarlyWinners research@pmp.local';
const SEC_RATE_LIMIT_MS = 120; // ~8 req/sec

export interface XbrlContext {
    id: string;
    entityIdentifier?: string;
    entityScheme?: string;
    startDate?: string;
    endDate?: string;
    instant?: string;
    dimensionMembers?: Map<string, string>; // axis → member
}

export interface XbrlFact {
    concept: string;       // e.g., "us-gaap:Revenues" or "Revenues"
    rawValue: string;      // raw string value from XML
    numericValue: number;  // parsed numeric value
    decimals: string | null;  // decimals attribute (e.g., "-6", "6", "INF")
    unitRef: string;       // unit reference (e.g., "USD", "shares")
    contextRef: string;    // context ID
    context?: XbrlContext;  // resolved context
    id?: string;           // fact ID attribute (sometimes contains unit hints like "USD_InMillions")
}

export interface XbrlUnit {
    id: string;
    measure: string;       // e.g., "iso4217:USD"
    numerator?: string;
    denominator?: string;  // for ratio units like USD/shares
}

export interface XbrlFilingEvidence {
    accessionNumber: string;
    cik: string;
    facts: XbrlFact[];
    contexts: Map<string, XbrlContext>;
    units: Map<string, XbrlUnit>;
    parseErrors: string[];
}

// ─── Download helpers ────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert accession number (with dashes) to the SEC directory format.
 * "0000092380-11-000070" → "000009238011000070"
 *
 * NOTE: The first part of the accession number is the FILER CIK, not the company CIK.
 * The SEC directory structure uses the COMPANY CIK. These can be different
 * (e.g., CPWR has company CIK=0000827099 but filings by agent CIK=0001038838).
 * So we MUST pass the company CIK separately.
 */
function accessionToDirName(accession: string): string {
    return accession.replace(/-/g, '');
}

/**
 * Download the filing index JSON to find the XBRL XML filename.
 * @param accession Accession number (e.g., "0000092380-11-000070")
 * @param companyCik Company CIK (e.g., "0000092380") — NOT the filer CIK from accession
 */
async function findXbrlXmlUrl(accession: string, companyCik: string): Promise<string | null> {
    const dirName = accessionToDirName(accession);
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(companyCik)}/${dirName}/index.json`;

    try {
        const res = await fetch(indexUrl, {
            headers: { 'User-Agent': SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        const items = data?.directory?.item || [];

        // Find the main XBRL XML file (not cal/def/lab/pre XMLs)
        // Pattern: <ticker>-<date>.xml or similar, excluding calculation/definition/label/presentation linkbases
        for (const item of items) {
            const name: string = item.name || '';
            if (name.endsWith('.xml') &&
                !name.endsWith('_cal.xml') &&
                !name.endsWith('_def.xml') &&
                !name.endsWith('_lab.xml') &&
                !name.endsWith('_pre.xml') &&
                !name.endsWith('.xsd') &&
                name !== 'FilingSummary.xml' &&
                !name.startsWith('Inline')) {
                return `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${dirName}/${name}`;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Download XBRL XML for a given accession number.
 * Caches to disk to avoid re-downloading.
 * @param accession Accession number (e.g., "0000092380-11-000070")
 * @param cacheDir Cache directory path
 * @param companyCik Company CIK (required — the SEC directory uses company CIK, not filer CIK)
 */
export async function downloadXbrlXml(
    accession: string,
    cacheDir: string,
    companyCik: string
): Promise<string | null> {
    const cachePath = path.join(cacheDir, `${accession.replace(/-/g, '')}.xml`);

    // Check cache
    if (fs.existsSync(cachePath)) {
        return fs.readFileSync(cachePath, 'utf-8');
    }

    // Find the XBRL XML URL
    const xmlUrl = await findXbrlXmlUrl(accession, companyCik);
    if (!xmlUrl) return null;

    await sleep(SEC_RATE_LIMIT_MS);

    try {
        const res = await fetch(xmlUrl, {
            headers: { 'User-Agent': SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' },
        });
        if (!res.ok) return null;
        const text = await res.text();

        // Cache to disk
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cachePath, text);
        return text;
    } catch {
        return null;
    }
}

// ─── XBRL XML Parser ─────────────────────────────────────────────────────

/**
 * Parse XBRL XML to extract all facts, contexts, and units.
 *
 * Uses regex-based parsing (not DOM) for performance on large XBRL files
 * (some are 2MB+). A full DOM parse would be slow and memory-intensive.
 */
export function parseXbrlXml(xml: string, accession: string, cik: string): XbrlFilingEvidence {
    const facts: XbrlFact[] = [];
    const contexts = new Map<string, XbrlContext>();
    const units = new Map<string, XbrlUnit>();
    const parseErrors: string[] = [];

    // ─── Parse contexts ───
    // Context format:
    // <xbrli:context id="FROM_Jan01_2011_TO_Jun30_2011">
    //   <xbrli:entity><xbrli:identifier scheme="...">CIK</xbrli:identifier>
    //     [optional: <xbrli:segment><xbrldi:explicitMember dimension="...">...</xbrldi:explicitMember></xbrli:segment>]
    //   </xbrli:entity>
    //   <xbrli:period>
    //     <xbrli:startDate>2011-01-01</xbrli:startDate><xbrli:endDate>2011-06-30</xbrli:endDate>
    //     OR
    //     <xbrli:instant>2011-06-30</xbrli:instant>
    //   </xbrli:period>
    // </xbrli:context>

    const contextRegex = /<xbrli:context\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:context>/g;
    let ctxMatch: RegExpExecArray | null;
    while ((ctxMatch = contextRegex.exec(xml)) !== null) {
        const ctxId = ctxMatch[1]!;
        const ctxBody = ctxMatch[2]!;

        // Extract entity identifier
        const identMatch = ctxBody.match(/<xbrli:identifier\s+scheme="([^"]+)"[^>]*>([^<]+)<\/xbrli:identifier>/);
        const entityIdentifier = identMatch?.[2]?.trim();
        const entityScheme = identMatch?.[1];

        // Extract period
        let startDate: string | undefined;
        let endDate: string | undefined;
        let instant: string | undefined;

        const startMatch = ctxBody.match(/<xbrli:startDate>([^<]+)<\/xbrli:startDate>/);
        const endMatch = ctxBody.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/);
        const instantMatch = ctxBody.match(/<xbrli:instant>([^<]+)<\/xbrli:instant>/);

        if (startMatch) startDate = startMatch[1]!.trim();
        if (endMatch) endDate = endMatch[1]!.trim();
        if (instantMatch) instant = instantMatch[1]!.trim();

        // Extract dimension members (for segment filtering)
        const dimensionMembers = new Map<string, string>();
        const dimRegex = /<xbrldi:explicitMember\s+dimension="([^"]+)"[^>]*>([^<]+)<\/xbrldi:explicitMember>/g;
        let dimMatch: RegExpExecArray | null;
        while ((dimMatch = dimRegex.exec(ctxBody)) !== null) {
            const axis = dimMatch[1]!;
            const member = dimMatch[2]!.trim();
            dimensionMembers.set(axis, member);
        }

        contexts.set(ctxId, {
            id: ctxId,
            entityIdentifier,
            entityScheme,
            startDate,
            endDate,
            instant,
            dimensionMembers: dimensionMembers.size > 0 ? dimensionMembers : undefined,
        });
    }

    // ─── Parse units ───
    // Unit format:
    // <xbrli:unit id="USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
    // OR for ratios:
    // <xbrli:unit id="USD_per_shares">
    //   <xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator>
    //   <xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide>
    // </xbrli:unit>

    const unitRegex = /<xbrli:unit\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/xbrli:unit>/g;
    let unitMatch: RegExpExecArray | null;
    while ((unitMatch = unitRegex.exec(xml)) !== null) {
        const unitId = unitMatch[1]!;
        const unitBody = unitMatch[2]!;

        const measureMatch = unitBody.match(/<xbrli:measure>([^<]+)<\/xbrli:measure>/);
        const numMatch = unitBody.match(/<xbrli:unitNumerator>[\s\S]*?<xbrli:measure>([^<]+)<\/xbrli:measure>[\s\S]*?<\/xbrli:unitNumerator>/);
        const denMatch = unitBody.match(/<xbrli:unitDenominator>[\s\S]*?<xbrli:measure>([^<]+)<\/xbrli:measure>[\s\S]*?<\/xbrli:unitDenominator>/);

        units.set(unitId, {
            id: unitId,
            measure: measureMatch?.[1]?.trim() || '',
            numerator: numMatch?.[1]?.trim(),
            denominator: denMatch?.[1]?.trim(),
        });
    }

    // ─── Parse numeric facts ───
    // Fact format:
    // <us-gaap:Revenues id="ID_286_USD_InMillions" decimals="6" contextRef="FROM_Apr01_2011_TO_Jun30_2011" unitRef="USD">4136</us-gaap:Revenues>
    //
    // We need to match:
    //   - namespace prefix (us-gaap, dei, etc.)
    //   - concept name
    //   - decimals attribute
    //   - contextRef attribute
    //   - unitRef attribute
    //   - id attribute (optional)
    //   - text content (the value)

    // Match all numeric facts with contextRef and unitRef
    // Pattern: <prefix:concept ...contextRef="..." unitRef="..." [decimals="..."] [id="..."]>value</prefix:concept>
    const factRegex = /<(?:us-gaap|dei):([A-Za-z0-9_]+)\s+([^>]*?)>([^<]+)<\/(?:us-gaap|dei):[A-Za-z0-9_]+>/g;
    let factMatch: RegExpExecArray | null;
    while ((factMatch = factRegex.exec(xml)) !== null) {
        const conceptName = factMatch[1]!;
        const attrs = factMatch[2]!;
        const valueText = factMatch[3]!.trim();

        // Must have contextRef and unitRef to be a numeric fact
        const ctxRefMatch = attrs.match(/contextRef="([^"]+)"/);
        const unitRefMatch = attrs.match(/unitRef="([^"]+)"/);
        if (!ctxRefMatch || !unitRefMatch) continue;

        const contextRef = ctxRefMatch[1]!;
        const unitRef = unitRefMatch[1]!;
        const decimalsMatch = attrs.match(/decimals="([^"]+)"/);
        const idMatch = attrs.match(/\sid="([^"]+)"/);

        const decimals = decimalsMatch?.[1] || null;
        const id = idMatch?.[1];

        // Parse numeric value
        const numericValue = parseFloat(valueText);
        if (isNaN(numericValue)) continue;

        const context = contexts.get(contextRef);

        facts.push({
            concept: conceptName,
            rawValue: valueText,
            numericValue,
            decimals,
            unitRef,
            contextRef,
            context,
            id,
        });
    }

    return {
        accessionNumber: accession,
        cik,
        facts,
        contexts,
        units,
        parseErrors,
    };
}

// ─── Matching: XBRL facts → companyfacts JSON facts ──────────────────────

/**
 * Match XBRL facts to companyfacts JSON facts.
 *
 * Companyfacts JSON fact keys: concept, val, accn, fy, fp, form, filed, frame, start, end
 * XBRL fact keys: concept, numericValue, decimals, unitRef, contextRef, context (start/end)
 *
 * Match by: (concept, start, end, accession)
 */
export interface MatchedFact {
    // From companyfacts JSON
    cfConcept: string;
    cfVal: number;
    cfAccn: string;
    cfStart: string | null;
    cfEnd: string;
    cfFy: number | null;
    cfFp: string | null;
    cfForm: string | null;

    // From XBRL XML (matched)
    xbrlDecimals: string | null;
    xbrlUnitRef: string | null;
    xbrlId: string | null;
    xbrlContextId: string | null;

    // Match status
    matched: boolean;
    matchReason: string;
}

export function matchXbrlToCompanyFacts(
    xbrlEvidence: XbrlFilingEvidence,
    cfFacts: Array<{
        concept: string;
        val: number;
        accn: string;
        start: string | null;
        end: string;
        fy: number | null;
        fp: string | null;
        form: string | null;
    }>
): MatchedFact[] {
    const results: MatchedFact[] = [];

    // Build XBRL fact index: (concept, start, end) → XbrlFact
    // Note: XBRL concept names don't have namespace prefix in our parsed facts
    const xbrlIndex = new Map<string, XbrlFact[]>();
    for (const xfact of xbrlEvidence.facts) {
        const ctx = xfact.context;
        if (!ctx) continue;

        // Skip facts with dimension members (segmented data) — we only want consolidated
        if (ctx.dimensionMembers && ctx.dimensionMembers.size > 0) continue;

        const start = ctx.startDate || '';
        const end = ctx.endDate || ctx.instant || '';
        const key = `${xfact.concept}|${start}|${end}`;
        if (!xbrlIndex.has(key)) xbrlIndex.set(key, []);
        xbrlIndex.get(key)!.push(xfact);
    }

    for (const cf of cfFacts) {
        // Try exact match: (concept, start, end)
        const key = `${cf.concept}|${cf.start || ''}|${cf.end}`;
        const xfacts = xbrlIndex.get(key);

        if (xfacts && xfacts.length > 0) {
            // Find the one with matching value
            const matching = xfacts.find(x => x.numericValue === cf.val);
            if (matching) {
                results.push({
                    cfConcept: cf.concept, cfVal: cf.val, cfAccn: cf.accn,
                    cfStart: cf.start, cfEnd: cf.end, cfFy: cf.fy, cfFp: cf.fp, cfForm: cf.form,
                    xbrlDecimals: matching.decimals, xbrlUnitRef: matching.unitRef,
                    xbrlId: matching.id || null, xbrlContextId: matching.contextRef,
                    matched: true, matchReason: 'exact (concept+start+end+value)',
                });
                continue;
            }
            // Value doesn't match but concept+period does — still useful for decimals
            results.push({
                cfConcept: cf.concept, cfVal: cf.val, cfAccn: cf.accn,
                cfStart: cf.start, cfEnd: cf.end, cfFy: cf.fy, cfFp: cf.fp, cfForm: cf.form,
                xbrlDecimals: xfacts[0]!.decimals, xbrlUnitRef: xfacts[0]!.unitRef,
                xbrlId: xfacts[0]!.id || null, xbrlContextId: xfacts[0]!.contextRef,
                matched: true, matchReason: `concept+period match, value differs (cf=${cf.val}, xbrl=${xfacts[0]!.numericValue})`,
            });
            continue;
        }

        // Try matching by end date only (instant facts may not have start)
        const endOnlyKey = `${cf.concept}||${cf.end}`;
        const endOnlyFacts = xbrlIndex.get(endOnlyKey);
        if (endOnlyFacts && endOnlyFacts.length > 0) {
            results.push({
                cfConcept: cf.concept, cfVal: cf.val, cfAccn: cf.accn,
                cfStart: cf.start, cfEnd: cf.end, cfFy: cf.fy, cfFp: cf.fp, cfForm: cf.form,
                xbrlDecimals: endOnlyFacts[0]!.decimals, xbrlUnitRef: endOnlyFacts[0]!.unitRef,
                xbrlId: endOnlyFacts[0]!.id || null, xbrlContextId: endOnlyFacts[0]!.contextRef,
                matched: true, matchReason: 'end-date only match',
            });
            continue;
        }

        results.push({
            cfConcept: cf.concept, cfVal: cf.val, cfAccn: cf.accn,
            cfStart: cf.start, cfEnd: cf.end, cfFy: cf.fy, cfFp: cf.fp, cfForm: cf.form,
            xbrlDecimals: null, xbrlUnitRef: null, xbrlId: null, xbrlContextId: null,
            matched: false, matchReason: 'no XBRL fact found for concept+period',
        });
    }

    return results;
}

// ─── Unit family resolution ──────────────────────────────────────────────

/**
 * Resolve XBRL unitRef to a unit family.
 * USD → CURRENCY
 * USD/shares → PER_SHARE
 * shares → SHARES
 * pure → PURE (percent, ratio)
 */
export function resolveUnitFamily(unitRef: string, units: Map<string, XbrlUnit>): 'CURRENCY' | 'PER_SHARE' | 'SHARES' | 'PURE' | 'UNKNOWN' {
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
