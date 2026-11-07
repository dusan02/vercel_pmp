import { extractFinancialsFromReport } from '../services/analysis/financialsExtraction';
import { computeDiscreteQuarter } from '../lib/utils/ttm';
import { computeDayRatios } from '../services/analysis/fillValuationDay';
import {
    checkBalanceIntegrity,
    checkMissingKeyFields,
    deriveMissingStatementFields,
    auditAndRepairStatements,
} from '../../scripts/audit-and-repair-statements';

describe('Financial Data Quality — Rigorous Extraction & Methodology Tests', () => {

    // ── 1. Net Income / NCI Rigor ─────────────────────────────────────────────
    describe('1. Net Income / Noncontrolling Interest (NCI) Distinction', () => {
        it('Scenár 1A: Spoločnosť s explicitným ziskom pre kmeňových akcionárov (NetIncomeCommon) a konsolidovaným ziskom', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_Revenues', value: 500_000_000 },
                    { concept: 'us-gaap_NetIncomeLoss', value: 100_000_000 }, // Consolidated group
                    { concept: 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', value: 80_000_000 }, // Common shareholders
                    { concept: 'us-gaap_NetIncomeLossAttributableToNoncontrollingInterest', value: 20_000_000 }, // NCI
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.netIncome).toBe(100_000_000);
            expect(result.netIncomeCommon).toBe(80_000_000);
            expect(result.noncontrollingInterest).toBe(20_000_000);
            expect(result.netIncomeCommonStatus).toBe('REPORTED_COMMON');
        });

        it('Scenár 1B: Konsolidovaný zisk a NCI sú prítomné, ale common zisk chýba -> dopočíta sa presne: NetIncome - NCI', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_NetIncomeLoss', value: 100_000_000 },
                    { concept: 'us-gaap_NetIncomeLossAttributableToNoncontrollingInterest', value: 15_000_000 },
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.netIncome).toBe(100_000_000);
            expect(result.netIncomeCommon).toBe(85_000_000);
            expect(result.noncontrollingInterest).toBe(15_000_000);
            expect(result.netIncomeCommonStatus).toBe('COMPUTED_FROM_NCI');
        });

        it('Scenár 1C: MANDATORY RULE: Chýbajúce NCI nesmie znamenať NCI = 0. Nikdy nesmie potichu nahradiť common zisk konsolidovaným!', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_NetIncomeLoss', value: 100_000_000 },
                    // Neither NetIncomeLossAvailableToCommonStockholdersBasic nor NCI is present
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.netIncome).toBe(100_000_000);
            expect(result.netIncomeCommon).toBeNull(); // STAYS NULL! Never falsely assumed to equal 100M
            expect(result.netIncomeCommonStatus).toBe('REPORTED_CONSOLIDATED_ONLY');
        });
    });

    // ── 2. Bank Revenue & Double-Counting Prevention ──────────────────────────
    describe('2. Bank Revenue — Zamedzenie dvojitému započítaniu', () => {
        it('Scenár 2A: Čistý úrokový výnos (NII) + neúrokové výnosy. Hrubý úrokový výnos sa NESMIE pripočítať!', () => {
            const mockReport = {
                ic: [
                    // Gross interest income is reported, but Net Interest Income is ALSO present
                    { concept: 'us-gaap_InterestAndDividendIncomeOperating', value: 80_000_000 }, // Gross
                    { concept: 'us-gaap_InterestIncomeExpenseNet', value: 45_000_000 }, // Net
                    { concept: 'us-gaap_NoninterestIncome', value: 15_000_000 }, // Fee/trading income
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            // Must be NetInterestIncome (45M) + NoninterestIncome (15M) = 60M
            // If it added gross (80M + 15M = 95M or 80M + 45M + 15M = 140M), it would be a critical failure!
            expect(result.revenue).toBe(60_000_000);
            expect(result.revenueModel).toBe('BANK_NET_INTEREST');
        });

        it('Scenár 2B: Len hrubý úrokový výnos a úrokový náklad -> tržba = (Gross - Expense) + Noninterest', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_InterestAndDividendIncomeOperating', value: 70_000_000 },
                    { concept: 'us-gaap_InterestExpense', value: 25_000_000 },
                    { concept: 'us-gaap_NoninterestIncome', value: 10_000_000 },
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            // (70M - 25M) + 10M = 55M
            expect(result.revenue).toBe(55_000_000);
            expect(result.revenueModel).toBe('BANK_GROSS_MINUS_EXPENSE');
        });

        it('Scenár 2C: Hrubý úrokový výnos BEZ úrokového nákladu nesmie byť uznaný ako tržba (zabraňuje nadhodnoteniu)', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_InterestAndDividendIncomeOperating', value: 70_000_000 },
                    // InterestExpense is missing and Net Interest is missing!
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.revenue).toBeNull(); // Must not fabricate revenue from gross interest alone!
            expect(result.revenueModel).toBe('UNKNOWN');
        });

        it('Scenár 2D: Nefinančná spoločnosť má prednosť cez zmluvné tržby (ASC 606)', () => {
            const mockReport = {
                ic: [
                    { concept: 'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', value: 250_000_000 },
                    { concept: 'us-gaap_InterestIncome', value: 2_000_000 }, // Minor cash interest
                ],
                bs: [],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.revenue).toBe(250_000_000);
            expect(result.revenueModel).toBe('COMMERCIAL');
        });
    });

    // ── 3. Balance Sheet Equilibrium & Legitimate Negative Equity ─────────────
    describe('3. Balance Sheet Equilibrium & Preservation of Negative Equity', () => {
        it('Scenár 3A: MCD / PM syndróm — záporný vlastný kapitál je legitímny GAAP stav a MUSÍ byť zachovaný!', () => {
            // MCD Balance Sheet: Assets = 50B, Liabilities = 55B, Equity = -5B.
            // 55B + (-5B) = 50B -> Perfektná rovnováha!
            const mockReport = {
                ic: [],
                bs: [
                    { concept: 'us-gaap_Assets', value: 50_000_000_000 },
                    { concept: 'us-gaap_Liabilities', value: 55_000_000_000 },
                    { concept: 'us-gaap_StockholdersEquity', value: -5_000_000_000 },
                ],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.totalAssets).toBe(50_000_000_000);
            expect(result.totalLiabilities).toBe(55_000_000_000);
            expect(result.totalEquity).toBe(-5_000_000_000);
            expect(result.balanceStatus).toBe('VALID_CONSISTENT');
            expect(result.balanceDerived).toBe(false);
            expect(result.balanceDiff).toBe(0);
        });

        it('Scenár 3B: Nekonzistentná súvaha (Assets != Liabilities + Equity) -> označiť ako INCONSISTENT, NEPREPISOVAŤ!', () => {
            const mockReport = {
                ic: [],
                bs: [
                    { concept: 'us-gaap_Assets', value: 100_000_000 },
                    { concept: 'us-gaap_Liabilities', value: 70_000_000 },
                    { concept: 'us-gaap_StockholdersEquity', value: 50_000_000 }, // 70M + 50M = 120M vs 100M (20% mismatch)
                ],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.balanceStatus).toBe('INCONSISTENT');
            expect(result.balanceDerived).toBe(false);
            expect(result.totalAssets).toBe(100_000_000);
            expect(result.totalLiabilities).toBe(70_000_000);
            expect(result.totalEquity).toBe(50_000_000); // Values preserved as reported, not clobbered!
        });

        it('Scenár 3C: Finnhub payload bez metadát -> automatické odvodenie VYPNUTÉ, zachováva nahlásenú hodnotu (null)', () => {
            const mockReport = {
                ic: [],
                bs: [
                    { concept: 'us-gaap_Assets', value: 200_000_000 },
                    { concept: 'us-gaap_StockholdersEquity', value: 80_000_000 },
                    // Liabilities missing
                ],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.totalAssets).toBe(200_000_000);
            expect(result.totalEquity).toBe(80_000_000);
            expect(result.totalLiabilities).toBeNull(); // Strictly preserved as reported!
            expect(result.balanceStatus).toBe('INCOMPLETE');
            expect(result.balanceDerived).toBe(false);
        });

        it('Scenár 3D: Overené metadáta (allowDerivation: true) -> odvodiť a explicitne označiť ako DERIVED', () => {
            const mockReport = {
                ic: [],
                bs: [
                    { concept: 'us-gaap_Assets', value: 200_000_000 },
                    { concept: 'us-gaap_StockholdersEquity', value: 80_000_000 },
                ],
                cf: [],
            };

            const result = extractFinancialsFromReport(mockReport, { allowDerivation: true });
            expect(result.totalAssets).toBe(200_000_000);
            expect(result.totalEquity).toBe(80_000_000);
            expect(result.totalLiabilities).toBe(120_000_000); // 200M - 80M
            expect(result.balanceStatus).toBe('DERIVED_LIABILITIES');
            expect(result.balanceDerived).toBe(true);
        });
    });

    // ── 4. Capex & FCF Convention ─────────────────────────────────────────────
    describe('4. Capex Sign Transformation & FCF Convention', () => {
        it('Scenár 4A: Záporný outflow capex (-45M) sa normalizuje na kladný výdavok (45M)', () => {
            const mockReport = {
                ic: [],
                bs: [],
                cf: [
                    { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', value: -45_000_000 },
                ],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.capex).toBe(45_000_000);
            expect(result.capexRaw).toBe(-45_000_000);
            expect(result.capexSignTransformation).toBe('INVERTED_FROM_OUTFLOW');
        });

        it('Scenár 4B: Kladný capex (30M) zostáva kladný výdavok (30M)', () => {
            const mockReport = {
                ic: [],
                bs: [],
                cf: [
                    { concept: 'us-gaap_PaymentsToAcquireProductiveAssets', value: 30_000_000 },
                ],
            };

            const result = extractFinancialsFromReport(mockReport);
            expect(result.capex).toBe(30_000_000);
            expect(result.capexRaw).toBe(30_000_000);
            expect(result.capexSignTransformation).toBe('REPORTED_POSITIVE');
        });
    });

    // ── 5. Quarterly Normalization & TTM Validation ───────────────────────────
    describe('5. Quarterly Normalization & Discrete Quarters', () => {
        const dummyDate = new Date('2024-03-31');
        const stmts: any[] = [
            { id: '1', symbol: 'AAPL', fiscalYear: 2024, fiscalPeriod: 'Q1', revenue: 100_000_000, netIncome: 20_000_000, operatingCashFlow: 30_000_000, capex: 5_000_000, endDate: dummyDate },
            { id: '2', symbol: 'AAPL', fiscalYear: 2024, fiscalPeriod: 'Q2', revenue: 220_000_000, netIncome: 45_000_000, operatingCashFlow: 65_000_000, capex: 12_000_000, endDate: dummyDate }, // cumulative 6M
            { id: '3', symbol: 'AAPL', fiscalYear: 2024, fiscalPeriod: 'Q3', revenue: 350_000_000, netIncome: 70_000_000, operatingCashFlow: 100_000_000, capex: 18_000_000, endDate: dummyDate }, // cumulative 9M
            { id: '4', symbol: 'AAPL', fiscalYear: 2024, fiscalPeriod: 'FY', revenue: 480_000_000, netIncome: 95_000_000, operatingCashFlow: 140_000_000, capex: 25_000_000, endDate: dummyDate }, // full year 12M
        ];

        it('Q1 je prirodzene diskrétny kvartál', () => {
            const q1 = computeDiscreteQuarter(stmts[0], stmts);
            expect(q1.isContiguous).toBe(true);
            expect(q1.discreteRevenue).toBe(100_000_000);
            expect(q1.discreteNetIncome).toBe(20_000_000);
        });

        it('Q2 diskrétny = Q2_cum (220M) - Q1_cum (100M) = 120M', () => {
            const q2 = computeDiscreteQuarter(stmts[1], stmts);
            expect(q2.isContiguous).toBe(true);
            expect(q2.discreteRevenue).toBe(120_000_000);
            expect(q2.discreteNetIncome).toBe(25_000_000); // 45M - 20M
            expect(q2.discreteCapex).toBe(7_000_000); // 12M - 5M
        });

        it('Q4 diskrétny = FY (480M) - Q3_cum (350M) = 130M', () => {
            const q4 = computeDiscreteQuarter(stmts[3], stmts);
            expect(q4.isContiguous).toBe(true);
            expect(q4.discreteRevenue).toBe(130_000_000);
            expect(q4.discreteNetIncome).toBe(25_000_000); // 95M - 70M
        });

        it('Ak chýba predchádzajúci kvartál, diskrétna hodnota vráti NULL a isContiguous = false', () => {
            // Stmts without Q1
            const stmtsMissingQ1 = [stmts[1], stmts[2], stmts[3]];
            const q2 = computeDiscreteQuarter(stmts[1], stmtsMissingQ1);
            expect(q2.isContiguous).toBe(false);
            expect(q2.discreteRevenue).toBeNull();
            expect(q2.discreteNetIncome).toBeNull();
        });
    });

    // ── 6. Audit & Repair Tooling Invariants ──────────────────────────────────
    describe('6. Audit & Repair Tooling Invariants', () => {
        it('checkBalanceIntegrity deteguje nekonzistenciu > 1%', () => {
            const result = checkBalanceIntegrity({
                totalAssets: 100_000_000,
                totalLiabilities: 60_000_000,
                totalEquity: 30_000_000, // 60M + 30M = 90M vs 100M (10% mismatch)
            });
            expect(result.hasMismatch).toBe(true);
            expect(result.diff).toBe(10_000_000);
            expect(result.pctDiff).toBe(10);
        });

        it('checkBalanceIntegrity prejde ak je súvaha v zhode', () => {
            const result = checkBalanceIntegrity({
                totalAssets: 100_000_000,
                totalLiabilities: 60_000_000,
                totalEquity: 40_000_000,
            });
            expect(result.hasMismatch).toBe(false);
            expect(result.diff).toBe(0);
        });

        it('checkMissingKeyFields nájde chýbajúce kľúčové polia', () => {
            const missing = checkMissingKeyFields({
                revenue: 100_000_000,
                netIncome: null,
                operatingCashFlow: null,
                totalAssets: 500_000_000,
            });
            expect(missing).toEqual(['netIncome', 'operatingCashFlow']);
        });

        it('deriveMissingStatementFields správne odvodí len chýbajúce polia a normalizuje záporný capex', () => {
            const patch = deriveMissingStatementFields({
                totalAssets: 500_000_000,
                totalLiabilities: null,
                totalEquity: 200_000_000,
                capex: -15_000_000,
            });
            expect(patch.totalLiabilities).toBe(300_000_000);
            expect(patch.capex).toBe(15_000_000);
        });
    });

    // ── 7. NetIncomeCommon Valuation Precision (P/E & EPS) ────────────────────
    describe('7. NetIncomeCommon Valuation Precision (P/E & EPS)', () => {
        const asOf = new Date('2024-12-31');
        const shares = 10_000_000;
        const closePrice = 100; // Market Cap = 1,000,000,000

        it('computeDayRatios počíta P/E z netIncomeCommon (nie konsolidovaného zisku s NCI)', () => {
            // Spoločnosť má konsolidovaný zisk 100M, ale zisk pre kmeňových akcionárov je len 50M (50M patrí menšinám)
            // Správne P/E: 1,000M / 50M = 20.0x
            // Ak by rátalo z konsolidovaného: 1,000M / 100M = 10.0x (chyba 100%!)
            const stmts: any[] = [
                {
                    id: '1', symbol: 'TEST', fiscalYear: 2024, fiscalPeriod: 'FY',
                    endDate: asOf,
                    revenue: 500_000_000,
                    netIncome: 100_000_000, // Consolidated
                    netIncomeCommon: 50_000_000, // Common shareholders
                    totalEquity: 400_000_000,
                    sharesOutstanding: shares,
                },
            ];

            const ratios = computeDayRatios(stmts, closePrice, asOf, shares);
            expect(ratios.peRatio).toBeCloseTo(20.0, 1);
            expect(ratios.peBasis).toBe('COMMON');
            // ROE naopak meria návratnosť celého kapitálu z konsolidovaného zisku: 100M / 400M = 25%
            expect(ratios.roe).toBeCloseTo(0.25, 2);
        });

        it('computeDayRatios pri chýbajúcom netIncomeCommon bezpečne použije netIncome ako fallback a označí peBasis', () => {
            const stmts: any[] = [
                {
                    id: '1', symbol: 'TEST', fiscalYear: 2024, fiscalPeriod: 'FY',
                    endDate: asOf,
                    revenue: 500_000_000,
                    netIncome: 50_000_000,
                    netIncomeCommon: null, // Legacy row without netIncomeCommon
                    totalEquity: 250_000_000,
                    sharesOutstanding: shares,
                },
            ];

            const ratios = computeDayRatios(stmts, closePrice, asOf, shares);
            // 1,000M / 50M = 20.0x
            expect(ratios.peRatio).toBeCloseTo(20.0, 1);
            expect(ratios.peBasis).toBe('CONSOLIDATED_FALLBACK');
            expect(ratios.roe).toBeCloseTo(0.20, 2);
        });

        it('derivePillarInputs explicitne rozlišuje peRatioBasis medzi COMMON a CONSOLIDATED_FALLBACK', async () => {
            const { derivePillarInputs } = await import('@/services/analysis/pillarInputs');
            const commonStmt = {
                fiscalPeriod: 'FY',
                fiscalYear: 2024,
                endDate: asOf,
                revenue: 500_000_000,
                netIncome: 100_000_000,
                netIncomeCommon: 50_000_000,
                ebit: 80_000_000,
                grossProfit: 200_000_000,
                operatingCashFlow: 90_000_000,
                capex: 20_000_000,
                sbc: 5_000_000,
                totalAssets: 600_000_000,
                totalLiabilities: 200_000_000,
                currentAssets: 150_000_000,
                currentLiabilities: 50_000_000,
                retainedEarnings: 100_000_000,
                totalEquity: 400_000_000,
                sharesOutstanding: shares,
                interestExpense: 5_000_000,
                totalDebt: 50_000_000,
                cashAndEquivalents: 40_000_000,
                netPPE: 200_000_000,
            };

            const dCommon = derivePillarInputs({
                stmts: [commonStmt],
                tickerData: { lastPrice: closePrice, lastMarketCap: null, sharesOutstanding: shares },
                finnhubMetrics: null,
                valuationRows: [],
            });
            expect(dCommon.peRatioBasis).toBe('COMMON');
            expect(dCommon.currentEps).toBe(5); // 50M / 10M shares

            const fallbackStmt = { ...commonStmt, netIncomeCommon: null };
            const dFallback = derivePillarInputs({
                stmts: [fallbackStmt],
                tickerData: { lastPrice: closePrice, lastMarketCap: null, sharesOutstanding: shares },
                finnhubMetrics: null,
                valuationRows: [],
            });
            expect(dFallback.peRatioBasis).toBe('CONSOLIDATED_FALLBACK');
            expect(dFallback.currentEps).toBe(10); // 100M / 10M shares
        });
    });
});
