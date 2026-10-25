/**
 * SA ebit protection tests — T FY2022 regression suite.
 *
 * Guards the invariant established by the Phase-1 audit:
 *  1. An existing stored EBIT is NEVER rewritten by Stock Analysis `opinc`,
 *     no matter how far the adjusted value diverges (reported GAAP −4.587B
 *     vs SA adjusted +28.349B — the old >50% repair swapped concepts).
 *  2. A missing stored EBIT is still null-filled from SA (repair removal
 *     must not regress gap-filling).
 *  3. Field fills, row creation and period conventions are unchanged.
 *
 * The removed repair could not tell a fabricated legacy ebit from a reported
 * XBRL OperatingIncomeLoss; with no persisted per-row provenance the only
 * safe policy is "existing value = untouchable".
 */
import { mergeSAPage } from '@/services/analysis/financialsSync';
import type { SAData } from '@/services/analysis/financialsSync';

const findUnique = jest.fn();
const update = jest.fn().mockResolvedValue({});
const create = jest.fn().mockResolvedValue({});
const upsert = jest.fn().mockResolvedValue({});

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        financialStatement: {
            findUnique: (...a: unknown[]) => findUnique(...a),
            update: (...a: unknown[]) => update(...a),
            create: (...a: unknown[]) => create(...a),
            upsert: (...a: unknown[]) => upsert(...a),
        },
    },
}));

/** T FY2022 fixture: GAAP reported OperatingIncomeLoss −$4.587B (incl. the
 *  $27.5B goodwill impairment) vs SA adjusted opinc +$28.349B. */
const T_REPORTED_EBIT = -4_587_000_000;
const T_SA_OPINC = 28_349_000_000;

function annualIncome(over: Partial<SAData> = {}): SAData {
    return {
        datekey: ['2022-12-31'],
        fiscalYear: ['2022'],
        fiscalQuarter: ['FY'],
        revenue: [120_700_000_000],
        netinccmn: [-8_524_000_000],
        opinc: [T_SA_OPINC],
        gp: [65_000_000_000],
        interestexpense: [6_108_000_000],
        ...over,
    };
}

function existingRow(over: Record<string, any> = {}): any {
    return {
        symbol: 'T', fiscalYear: 2022, fiscalPeriod: 'FY',
        ebit: T_REPORTED_EBIT,
        revenue: 120_700_000_000, netIncome: -8_524_000_000,
        operatingCashFlow: 35_000_000_000, capex: 24_000_000_000, sbc: null,
        interestExpense: 6_108_000_000, totalAssets: 400_000_000_000,
        totalLiabilities: 290_000_000_000, currentAssets: 60_000_000_000,
        currentLiabilities: 50_000_000_000, retainedEarnings: null,
        totalEquity: 100_000_000_000, sharesOutstanding: 7_130_000_000,
        totalDebt: 140_000_000_000, cashAndEquivalents: 3_000_000_000,
        grossProfit: 65_000_000_000, netPPE: null,
        ...over,
    };
}

function lastUpdatePatch(): Record<string, any> {
    const call = update.mock.calls.at(-1)?.[0] as any;
    return call?.data ?? {};
}

beforeEach(() => {
    findUnique.mockReset(); update.mockClear(); create.mockClear(); upsert.mockClear();
});

describe('SA ebit protection (T FY2022 regression)', () => {
    it('never overwrites a stored reported GAAP ebit with adjusted SA opinc (>50% divergence)', async () => {
        findUnique.mockResolvedValue(existingRow());
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: true });
        // Row needs no fills → either no update at all, or a patch without ebit
        if (update.mock.calls.length > 0) {
            expect(lastUpdatePatch()).not.toHaveProperty('ebit');
        }
    });

    it('keeps stored ebit intact even when SA supplies a divergent value on an incomplete-payload resync', async () => {
        // Simulates the transient case: Finnhub omitted the period this run,
        // the SA merge still visits it — structural guarantee, no provenance
        // needed: there is no code path that writes ebit on an existing row.
        findUnique.mockResolvedValue(existingRow({ retainedEarnings: null }));
        await mergeSAPage('T', annualIncome(), {
            datekey: ['2022-12-31'], fiscalYear: ['2022'], fiscalQuarter: ['FY'],
            retearn: [57_000_000_000],
        }, null, { quarterly: false, gapfill: true });
        expect(lastUpdatePatch()).toHaveProperty('retainedEarnings', 57_000_000_000);
        expect(lastUpdatePatch()).not.toHaveProperty('ebit');
    });

    it('does not rewrite a genuinely derived (non-reported) legacy ebit either', async () => {
        // Fabricated-looking stored value (GP−SGA estimate, e.g. −5.1B vs
        // SA +28.3B): equally untouchable — without provenance the repair
        // cannot distinguish derived from reported.
        findUnique.mockResolvedValue(existingRow({ ebit: -5_100_000_000 }));
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: true });
        if (update.mock.calls.length > 0) {
            expect(lastUpdatePatch()).not.toHaveProperty('ebit');
        }
    });

    it('still null-fills ebit from SA when the stored value is missing', async () => {
        findUnique.mockResolvedValue(existingRow({ ebit: null }));
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: true });
        expect(lastUpdatePatch()).toHaveProperty('ebit', T_SA_OPINC);
    });

    it('does not null-fill when SA opinc itself is absent', async () => {
        findUnique.mockResolvedValue(existingRow({ ebit: null }));
        await mergeSAPage('T', annualIncome({ opinc: [null] }), null, null, { quarterly: false, gapfill: true });
        if (update.mock.calls.length > 0) {
            expect(lastUpdatePatch()).not.toHaveProperty('ebit');
        }
    });

    it('full (non-gapfill) mode still writes SA values verbatim on new rows', async () => {
        findUnique.mockResolvedValue(null);
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: false });
        const data = (upsert.mock.calls.at(-1)?.[0] as any)?.create;
        expect(data).toMatchObject({ ebit: T_SA_OPINC, fiscalPeriod: 'FY', fiscalYear: 2022 });
    });

    it('full mode never overwrites an existing non-null ebit (AMIX scenario)', async () => {
        // AMIX: rows carry ebit but no revenue — a transient zero-revenue
        // ticker state must not let SA rewrite a previously stored ebit.
        findUnique.mockResolvedValue({ ebit: 120_000_000 });
        await mergeSAPage('AMIX', annualIncome({
            revenue: [null], opinc: [250_000_000],
        }), null, null, { quarterly: false, gapfill: false });
        const updateData = (upsert.mock.calls.at(-1)?.[0] as any)?.update;
        expect(updateData).not.toHaveProperty('ebit');
    });

    it('full mode null-fills ebit when the stored value is missing (GBTC scenario)', async () => {
        findUnique.mockResolvedValue({ ebit: null });
        await mergeSAPage('GBTC', annualIncome({
            revenue: [null], opinc: [300_000_000],
        }), null, null, { quarterly: false, gapfill: false });
        const updateData = (upsert.mock.calls.at(-1)?.[0] as any)?.update;
        expect(updateData).toHaveProperty('ebit', 300_000_000);
    });

    it('full mode preserves ebit on a generic existing row (reported or derived)', async () => {
        findUnique.mockResolvedValue({ ebit: T_REPORTED_EBIT });
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: false });
        const updateData = (upsert.mock.calls.at(-1)?.[0] as any)?.update;
        expect(updateData).not.toHaveProperty('ebit');
    });

    it('creates new gapfill rows with SA ebit when the period is absent entirely', async () => {
        findUnique.mockResolvedValue(null);
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: false, gapfill: true });
        const data = (create.mock.calls.at(-1)?.[0] as any)?.data;
        expect(data).toMatchObject({ ebit: T_SA_OPINC, fiscalPeriod: 'FY' });
    });

    it('quarterly page skips FY/Q4 rows — period convention unchanged', async () => {
        await mergeSAPage('T', annualIncome(), null, null, { quarterly: true, gapfill: true });
        expect(findUnique).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});
