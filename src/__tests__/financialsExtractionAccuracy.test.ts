import { extractFinancialsFromReport } from '../services/analysis/financialsExtraction';

describe('financials extraction accuracy (Finnhub mock reports)', () => {
    it('Scenár 1: Spoločnosť s Noncontrolling Interest (má NetIncomeLoss = 100M a NetIncomeLossAvailableToCommonStockholdersBasic = 80M) -> extrahuje sa 80M', () => {
        const mockReport = {
            ic: [
                { concept: 'us-gaap_Revenues', value: 500_000_000 },
                { concept: 'us-gaap_NetIncomeLoss', value: 100_000_000 },
                { concept: 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', value: 80_000_000 },
            ],
            bs: [],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.netIncome).toBe(80_000_000);
    });

    it('Scenár 1 (bez prefixu us-gaap_): NetIncomeLossAvailableToCommonStockholdersBasic má prednosť', () => {
        const mockReport = {
            ic: [
                { concept: 'NetIncomeLoss', value: 120_000_000 },
                { concept: 'NetIncomeLossAvailableToCommonStockholdersBasic', value: 95_000_000 },
            ],
            bs: [],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.netIncome).toBe(95_000_000);
    });

    it('Scenár 2: Banka bez bežných tržieb, ktorá má InterestAndDividendIncomeOperating = 50M a NoninterestIncome = 20M -> revenue = 70M', () => {
        const mockReport = {
            ic: [
                { concept: 'us-gaap_InterestAndDividendIncomeOperating', value: 50_000_000 },
                { concept: 'us-gaap_NoninterestIncome', value: 20_000_000 },
                { concept: 'us-gaap_NetIncomeLoss', value: 15_000_000 },
            ],
            bs: [],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.revenue).toBe(70_000_000);
    });

    it('Scenár 2 (bez us-gaap_ prefixu): Banka bez bežných tržieb sčítava úrokové a neúrokové výnosy', () => {
        const mockReport = {
            ic: [
                { concept: 'InterestAndDividendIncomeOperating', value: 35_000_000 },
                { concept: 'NoninterestIncome', value: 15_000_000 },
            ],
            bs: [],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.revenue).toBe(50_000_000);
    });

    it('Scenár 3: Bilančná rovnováha: chýbajúce liabilities sa dopočítajú z Assets - Equity', () => {
        const mockReport = {
            ic: [],
            bs: [
                { concept: 'us-gaap_Assets', value: 500_000_000 },
                { concept: 'us-gaap_StockholdersEquity', value: 200_000_000 },
            ],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.totalAssets).toBe(500_000_000);
        expect(result.totalEquity).toBe(200_000_000);
        expect(result.totalLiabilities).toBe(300_000_000); // 500M - 200M
    });

    it('Scenár 3 (variant): chýbajúce equity sa dopočíta z Assets - Liabilities', () => {
        const mockReport = {
            ic: [],
            bs: [
                { concept: 'us-gaap_Assets', value: 1_000_000_000 },
                { concept: 'us-gaap_Liabilities', value: 650_000_000 },
            ],
            cf: [],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.totalAssets).toBe(1_000_000_000);
        expect(result.totalLiabilities).toBe(650_000_000);
        expect(result.totalEquity).toBe(350_000_000); // 1000M - 650M
    });

    it('Scenár 4: Capex so záporným znamienkom sa normalizuje na kladné číslo', () => {
        const mockReport = {
            ic: [],
            bs: [],
            cf: [
                { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', value: -45_000_000 },
            ],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.capex).toBe(45_000_000);
    });

    it('Scenár 4 (variant): Capex s kladným znamienkom zostáva kladné číslo', () => {
        const mockReport = {
            ic: [],
            bs: [],
            cf: [
                { concept: 'us-gaap_PaymentsToAcquireProductiveAssets', value: 30_000_000 },
            ],
        };

        const result = extractFinancialsFromReport(mockReport);
        expect(result.capex).toBe(30_000_000);
    });
});

import {
    checkBalanceIntegrity,
    checkMissingKeyFields,
    deriveMissingStatementFields,
    auditAndRepairStatements,
} from '../../scripts/audit-and-repair-statements';

describe('audit-and-repair-statements unit tests', () => {
    describe('checkBalanceIntegrity', () => {
        it('deteguje nezrovnalosť ak je odchýlka väčšia ako 1 %', () => {
            // Assets = 100M, Liab + Eq = 90M (10% odchýlka)
            const result = checkBalanceIntegrity({
                totalAssets: 100_000_000,
                totalLiabilities: 50_000_000,
                totalEquity: 40_000_000,
            });
            expect(result.hasMismatch).toBe(true);
            expect(result.diff).toBe(10_000_000);
            expect(result.pctDiff).toBe(10);
        });

        it('prejde ak je odchýlka do 1 %', () => {
            // Assets = 100M, Liab + Eq = 99.5M (0.5% odchýlka)
            const result = checkBalanceIntegrity({
                totalAssets: 100_000_000,
                totalLiabilities: 60_000_000,
                totalEquity: 39_500_000,
            });
            expect(result.hasMismatch).toBe(false);
            expect(result.pctDiff).toBeCloseTo(0.5, 2);
        });

        it('nevyvolá varovanie ak sú totalAssets nulové alebo null', () => {
            const zeroAssets = checkBalanceIntegrity({
                totalAssets: 0,
                totalLiabilities: 50_000_000,
                totalEquity: 40_000_000,
            });
            expect(zeroAssets.hasMismatch).toBe(false);

            const nullAssets = checkBalanceIntegrity({
                totalAssets: null,
                totalLiabilities: 50_000_000,
                totalEquity: 40_000_000,
            });
            expect(nullAssets.hasMismatch).toBe(false);
        });
    });

    describe('checkMissingKeyFields', () => {
        it('deteguje chýbajúce kľúčové polia', () => {
            const missing = checkMissingKeyFields({
                revenue: 100_000_000,
                netIncome: null,
                operatingCashFlow: null,
                totalAssets: 500_000_000,
            });
            expect(missing).toEqual(['netIncome', 'operatingCashFlow']);
        });

        it('vráti prázdne pole ak sú všetky 4 polia prítomné', () => {
            const missing = checkMissingKeyFields({
                revenue: 100_000_000,
                netIncome: 10_000_000,
                operatingCashFlow: 15_000_000,
                totalAssets: 500_000_000,
            });
            expect(missing).toEqual([]);
        });
    });

    describe('deriveMissingStatementFields', () => {
        it('dopočíta chýbajúce liabilities z Assets - Equity', () => {
            const patch = deriveMissingStatementFields({
                totalAssets: 800_000_000,
                totalLiabilities: null,
                totalEquity: 300_000_000,
                capex: 20_000_000,
            });
            expect(patch.totalLiabilities).toBe(500_000_000);
        });

        it('dopočíta chýbajúce equity z Assets - Liabilities', () => {
            const patch = deriveMissingStatementFields({
                totalAssets: 800_000_000,
                totalLiabilities: 500_000_000,
                totalEquity: null,
                capex: 20_000_000,
            });
            expect(patch.totalEquity).toBe(300_000_000);
        });

        it('normalizuje záporný capex na kladné číslo', () => {
            const patch = deriveMissingStatementFields({
                totalAssets: 800_000_000,
                totalLiabilities: 500_000_000,
                totalEquity: 300_000_000,
                capex: -25_000_000,
            });
            expect(patch.capex).toBe(25_000_000);
        });
    });

    describe('auditAndRepairStatements summary', () => {
        it('správne spočíta anomálie a súhrn', async () => {
            const mockStatements: any[] = [
                {
                    id: '1',
                    symbol: 'AAPL',
                    fiscalYear: 2024,
                    fiscalPeriod: 'FY',
                    endDate: new Date('2024-09-30'),
                    revenue: 400_000_000_000,
                    netIncome: 100_000_000_000,
                    operatingCashFlow: 120_000_000_000,
                    totalAssets: 350_000_000_000,
                    totalLiabilities: 280_000_000_000,
                    totalEquity: 70_000_000_000,
                    capex: 10_000_000_000,
                },
                {
                    id: '2',
                    symbol: 'TEST',
                    fiscalYear: 2024,
                    fiscalPeriod: 'Q1',
                    endDate: new Date('2024-03-31'),
                    revenue: null, // missing key field
                    netIncome: 50_000_000,
                    operatingCashFlow: null, // missing key field
                    totalAssets: 100_000_000,
                    totalLiabilities: 20_000_000,
                    totalEquity: 30_000_000, // 20M + 30M = 50M vs 100M (50% mismatch)
                    capex: -5_000_000,
                },
            ];

            const { summary, anomalies } = await auditAndRepairStatements(mockStatements, { fix: false });
            expect(summary.totalChecked).toBe(2);
            expect(summary.balanceAnomaliesCount).toBe(1);
            expect(summary.missingFieldsAnomaliesCount).toBe(1);
            expect(summary.anomaliesCount).toBe(2);
            expect(anomalies).toHaveLength(2);
        });
    });
});

