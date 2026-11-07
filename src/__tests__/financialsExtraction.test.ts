import { syncFinancials } from '@/services/analysis/financialsSync';

const findUniqueTicker = jest.fn();
const upsertTicker = jest.fn().mockResolvedValue({});
const updateTicker = jest.fn().mockResolvedValue({});
const findUniqueStmt = jest.fn();
const upsertStmt = jest.fn().mockResolvedValue({});
const countStmt = jest.fn().mockResolvedValue(1);
const findFirstStmt = jest.fn().mockResolvedValue({
    endDate: new Date(),
    totalAssets: 1000,
    totalEquity: 500,
});
const findManyStmt = jest.fn().mockResolvedValue([]);

jest.mock('@/lib/db/prisma', () => ({
    prisma: {
        ticker: {
            upsert: (...a: unknown[]) => upsertTicker(...a),
            findUnique: (...a: unknown[]) => findUniqueTicker(...a),
            update: (...a: unknown[]) => updateTicker(...a),
        },
        financialStatement: {
            findUnique: (...a: unknown[]) => findUniqueStmt(...a),
            upsert: (...a: unknown[]) => upsertStmt(...a),
            count: (...a: unknown[]) => countStmt(...a),
            findFirst: (...a: unknown[]) => findFirstStmt(...a),
            findMany: (...a: unknown[]) => findManyStmt(...a),
        },
    },
}));

const originalFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    process.env.FINNHUB_API_KEY = 'test_token';
    findUniqueTicker.mockResolvedValue({
        sharesOutstanding: 100_000_000,
        lastMarketCap: 10,
        lastPrice: 100,
    });
    findUniqueStmt.mockResolvedValue(null);
});

afterAll(() => {
    global.fetch = originalFetch;
});

describe('Financials extraction concept registry & balance sheet equilibrium', () => {
    it('prioritizes NetIncomeLossAvailableToCommonStockholdersBasic over consolidated NetIncomeLoss', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('freq=annual')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [{
                            year: 2023,
                            endDate: '2023-12-31',
                            report: {
                                ic: [
                                    { concept: 'us-gaap_NetIncomeLoss', value: 10_000_000 },
                                    { concept: 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', value: 8_000_000 },
                                    { concept: 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', value: 50_000_000 },
                                    { concept: 'us-gaap_OperatingIncomeLoss', value: 12_000_000 },
                                ],
                                bs: [
                                    { concept: 'us-gaap_Assets', value: 100_000_000 },
                                    { concept: 'us-gaap_Liabilities', value: 60_000_000 },
                                    { concept: 'us-gaap_StockholdersEquity', value: 40_000_000 },
                                    { concept: 'dei_EntityCommonStockSharesOutstanding', value: 10_000_000 },
                                ],
                                cf: [
                                    { concept: 'us-gaap_NetCashProvidedByUsedInOperatingActivities', value: 15_000_000 },
                                    { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', value: -5_000_000 },
                                ],
                            },
                        }],
                    }),
                });
            }
            return Promise.resolve({
                ok: true,
                json: async () => ({ data: [] }),
            });
        });

        await syncFinancials('TEST');

        expect(upsertStmt).toHaveBeenCalled();
        const upsertCall = upsertStmt.mock.calls[0][0];
        // netIncome in FinancialStatement stores consolidated net income (10M)
        expect(upsertCall.create.netIncome).toBe(10_000_000);
        expect(upsertCall.update.netIncome).toBe(10_000_000);
        // netIncomeCommon stores common shareholders net income (8M)
        expect(upsertCall.create.netIncomeCommon).toBe(8_000_000);
        expect(upsertCall.update.netIncomeCommon).toBe(8_000_000);
        // capex should be strictly positive (absOrNull)
        expect(upsertCall.create.capex).toBe(5_000_000);
        expect(upsertCall.update.capex).toBe(5_000_000);
    });

    it('preserves reported values without automatic derivation when totalLiabilities is missing', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('freq=annual')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [{
                            year: 2023,
                            endDate: '2023-12-31',
                            report: {
                                ic: [
                                    { concept: 'RevenueFromContractWithCustomerExcludingAssessedTax', value: 20_000_000 },
                                ],
                                bs: [
                                    { concept: 'Assets', value: 100_000_000 },
                                    { concept: 'StockholdersEquity', value: 30_000_000 },
                                ],
                                cf: [],
                            },
                        }],
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
        });

        await syncFinancials('TEST');

        const upsertCall = upsertStmt.mock.calls[0][0];
        expect(upsertCall.create.totalAssets).toBe(100_000_000);
        expect(upsertCall.create.totalEquity).toBe(30_000_000);
        expect(upsertCall.create.totalLiabilities).toBeNull(); // Strictly preserved as reported!
    });

    it('preserves reported values without automatic derivation when totalAssets is missing', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('freq=annual')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [{
                            year: 2023,
                            endDate: '2023-12-31',
                            report: {
                                ic: [
                                    { concept: 'Revenues', value: 20_000_000 },
                                ],
                                bs: [
                                    { concept: 'us-gaap_Liabilities', value: 70_000_000 },
                                    { concept: 'us-gaap_StockholdersEquity', value: 30_000_000 },
                                ],
                                cf: [],
                            },
                        }],
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
        });

        await syncFinancials('TEST');

        const upsertCall = upsertStmt.mock.calls[0][0];
        expect(upsertCall.create.totalAssets).toBeNull(); // Strictly preserved as reported!
        expect(upsertCall.create.totalLiabilities).toBe(70_000_000);
        expect(upsertCall.create.totalEquity).toBe(30_000_000);
    });

    it('preserves reported values without automatic derivation when totalEquity is missing', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('freq=annual')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [{
                            year: 2023,
                            endDate: '2023-12-31',
                            report: {
                                ic: [
                                    { concept: 'TotalRevenuesAndOtherIncome', value: 25_000_000 },
                                ],
                                bs: [
                                    { concept: 'us-gaap_Assets', value: 120_000_000 },
                                    { concept: 'us-gaap_Liabilities', value: 80_000_000 },
                                ],
                                cf: [],
                            },
                        }],
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
        });

        await syncFinancials('TEST');

        const upsertCall = upsertStmt.mock.calls[0][0];
        expect(upsertCall.create.totalEquity).toBeNull(); // Strictly preserved as reported!
        expect(upsertCall.create.totalAssets).toBe(120_000_000);
        expect(upsertCall.create.totalLiabilities).toBe(80_000_000);
    });

    it('supports bank and utility revenue fallbacks and custom-prefix capex/OCF', async () => {
        global.fetch = jest.fn().mockImplementation((url: string) => {
            if (url.includes('freq=annual')) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({
                        data: [{
                            year: 2023,
                            endDate: '2023-12-31',
                            report: {
                                ic: [
                                    { concept: 'us-gaap_InterestIncomeExpenseNet', value: 15_000_000 },
                                    { concept: 'us-gaap_NoninterestIncome', value: 5_000_000 },
                                    { concept: 'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', value: 50_000_000 },
                                ],
                                bs: [
                                    { concept: 'us-gaap_Assets', value: 200_000_000 },
                                    { concept: 'us-gaap_Liabilities', value: 150_000_000 },
                                    { concept: 'us-gaap_StockholdersEquity', value: 50_000_000 },
                                ],
                                cf: [
                                    { concept: 'custom_NetCashProvidedByUsedInOperatingActivities', value: 22_000_000 },
                                    { concept: 'psx_CapitalExpendituresAndInvestments', value: -8_500_000 },
                                ],
                            },
                        }],
                    }),
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ data: [] }) });
        });

        await syncFinancials('TEST');

        const upsertCall = upsertStmt.mock.calls[0][0];
        // Revenue should be bank interest + non-interest: 15M + 5M = 20M
        expect(upsertCall.create.revenue).toBe(20_000_000);
        // OCF via suffix match
        expect(upsertCall.create.operatingCashFlow).toBe(22_000_000);
        // Capex via suffix match and positive
        expect(upsertCall.create.capex).toBe(8_500_000);
        // Diluted shares in ic
        expect(upsertCall.create.sharesOutstanding).toBe(50_000_000);
    });
});
