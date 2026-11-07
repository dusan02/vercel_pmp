import { describe, it, expect } from 'vitest';
import { parseEasternToUtc, formatUtcToEastern } from '../timezone';
import {
  FinancialFilingRecord,
  getPointInTimeFinancialFiling,
  getPointInTimeFinancialUniverse,
} from '../pit-filing-service';
import {
  normalizeFiscalYearQuarterlyFlows,
  calculatePointInTimeTTM,
} from '../pit-quarterly-normalizer';


describe('PMP v3.1.3-A2: PIT Timezone & Filing Service Unit Tests', () => {
  // Helper to create mock filings
  function createMockFiling(overrides: Partial<FinancialFilingRecord>): FinancialFilingRecord {
    const rawAccepted = overrides.rawAcceptedStr ?? '2022-10-27 18:01:14';
    const parsed = parseEasternToUtc(rawAccepted);

    return {
      id: overrides.id ?? 'filing-1',
      symbol: overrides.symbol ?? 'AAPL',
      accessNumber: overrides.accessNumber ?? '0000320193-22-000108',
      cik: overrides.cik ?? '0000320193',
      form: overrides.form ?? '10-K',
      isAmendment: overrides.form?.includes('/A') ?? false,
      fiscalYear: overrides.fiscalYear ?? 2022,
      fiscalPeriod: overrides.fiscalPeriod ?? 'FY',
      period: overrides.period ?? '2022FY',
      startDate: overrides.startDate ?? new Date('2021-09-26T00:00:00Z'),
      endDate: overrides.endDate ?? new Date('2022-09-24T00:00:00Z'),
      filedDate: overrides.filedDate ?? new Date('2022-10-28T00:00:00Z'),
      acceptedDate: overrides.acceptedDate ?? parsed.utcDate,
      availableAt: overrides.availableAt ?? parsed.utcDate,
      rawAcceptedStr: rawAccepted,
      rawTimezone: 'America/New_York',
      source: overrides.source !== undefined ? overrides.source : 'FINNHUB_SEC',
      revenue: overrides.revenue !== undefined ? overrides.revenue : 394328000000,
      netIncome: overrides.netIncome !== undefined ? overrides.netIncome : 99803000000,
      ebit: overrides.ebit !== undefined ? overrides.ebit : 119437000000,
      grossProfit: overrides.grossProfit !== undefined ? overrides.grossProfit : 170782000000,
      operatingCashFlow: overrides.operatingCashFlow !== undefined ? overrides.operatingCashFlow : 122151000000,
      capex: overrides.capex !== undefined ? overrides.capex : 10708000000,
      totalAssets: overrides.totalAssets !== undefined ? overrides.totalAssets : 352755000000,
      totalLiabilities: overrides.totalLiabilities !== undefined ? overrides.totalLiabilities : 302083000000,
      currentAssets: overrides.currentAssets !== undefined ? overrides.currentAssets : 135405000000,
      currentLiabilities: overrides.currentLiabilities !== undefined ? overrides.currentLiabilities : 153982000000,
      totalEquity: overrides.totalEquity !== undefined ? overrides.totalEquity : 50672000000,
      sharesOutstanding: overrides.sharesOutstanding !== undefined ? overrides.sharesOutstanding : 16215963000,
      cashAndEquivalents: overrides.cashAndEquivalents !== undefined ? overrides.cashAndEquivalents : 23646000000,
      totalDebt: overrides.totalDebt !== undefined ? overrides.totalDebt : 120069000000,
    };

  }

  // ---------------------------------------------------------------------------
  // Test 1: Filing pred otvorením trhu (Pre-Market Filing, e.g. 06:15 ET)
  // ---------------------------------------------------------------------------
  it('Scenario 1: Filing pred otvorením trhu (06:15 ET)', () => {
    // Company files at 06:15 EDT on Nov 8, 2022
    const filing = createMockFiling({
      id: 'pre-mkt-1',
      symbol: 'TEST',
      rawAcceptedStr: '2022-11-08 06:15:00',
    });

    // Case 1a: As-of at 06:00 EDT (15 min before filing)
    const asOfBefore = parseEasternToUtc('2022-11-08 06:00:00').utcDate;
    const resultBefore = getPointInTimeFinancialFiling([filing], {
      symbol: 'TEST',
      asOf: asOfBefore,
    });
    expect(resultBefore).toBeNull(); // Must NOT leak future filing

    // Case 1b: As-of at 06:30 EDT (15 min after filing, before market open 09:30)
    const asOfAfter = parseEasternToUtc('2022-11-08 06:30:00').utcDate;
    const resultAfter = getPointInTimeFinancialFiling([filing], {
      symbol: 'TEST',
      asOf: asOfAfter,
    });
    expect(resultAfter).not.toBeNull();
    expect(resultAfter?.id).toBe('pre-mkt-1');
  });

  // ---------------------------------------------------------------------------
  // Test 2: Filing počas obchodovania (Intraday Filing, e.g. 11:30 ET)
  // ---------------------------------------------------------------------------
  it('Scenario 2: Filing počas obchodovania (11:30 ET)', () => {
    const filing = createMockFiling({
      id: 'intraday-1',
      symbol: 'TEST',
      rawAcceptedStr: '2022-11-08 11:30:00',
    });

    // As-of at 11:00 ET (during morning trading before filing)
    const asOfBefore = parseEasternToUtc('2022-11-08 11:00:00').utcDate;
    expect(
      getPointInTimeFinancialFiling([filing], { symbol: 'TEST', asOf: asOfBefore })
    ).toBeNull();

    // As-of at 12:00 ET (after filing during trading)
    const asOfAfter = parseEasternToUtc('2022-11-08 12:00:00').utcDate;
    const resultAfter = getPointInTimeFinancialFiling([filing], {
      symbol: 'TEST',
      asOf: asOfAfter,
    });
    expect(resultAfter?.id).toBe('intraday-1');
  });

  // ---------------------------------------------------------------------------
  // Test 3: Filing po zatvorení trhu (After-Hours Filing, e.g. 16:45 ET)
  // ---------------------------------------------------------------------------
  it('Scenario 3: Filing po zatvorení trhu (16:45 ET)', () => {
    const filing = createMockFiling({
      id: 'after-hrs-1',
      symbol: 'TEST',
      rawAcceptedStr: '2022-11-08 16:45:00',
    });

    // As-of at regular market close (16:00 ET) -> Filing was NOT yet available!
    const asOfClose = parseEasternToUtc('2022-11-08 16:00:00').utcDate;
    expect(
      getPointInTimeFinancialFiling([filing], { symbol: 'TEST', asOf: asOfClose })
    ).toBeNull();

    // As-of at next morning open (Nov 9, 09:30 ET) -> Filing is now available!
    const asOfNextOpen = parseEasternToUtc('2022-11-09 09:30:00').utcDate;
    expect(
      getPointInTimeFinancialFiling([filing], { symbol: 'TEST', asOf: asOfNextOpen })?.id
    ).toBe('after-hrs-1');
  });

  // ---------------------------------------------------------------------------
  // Test 4: Filing cez víkend (Weekend Filing, e.g. Saturday 14:00 ET)
  // ---------------------------------------------------------------------------
  it('Scenario 4: Filing cez víkend (Sobota 14:00 ET)', () => {
    // 2022-11-05 was Saturday
    const filing = createMockFiling({
      id: 'weekend-1',
      symbol: 'TEST',
      rawAcceptedStr: '2022-11-05 14:00:00',
    });

    // Friday close 2022-11-04 16:00 ET
    const asOfFri = parseEasternToUtc('2022-11-04 16:00:00').utcDate;
    expect(
      getPointInTimeFinancialFiling([filing], { symbol: 'TEST', asOf: asOfFri })
    ).toBeNull();

    // Monday morning open 2022-11-07 09:30 ET
    const asOfMon = parseEasternToUtc('2022-11-07 09:30:00').utcDate;
    expect(
      getPointInTimeFinancialFiling([filing], { symbol: 'TEST', asOf: asOfMon })?.id
    ).toBe('weekend-1');
  });

  // ---------------------------------------------------------------------------
  // Test 5: Opravený výkaz 10-Q/A po pôvodnom 10-Q (Zachovanie histórie)
  // ---------------------------------------------------------------------------
  it('Scenario 5: 10-Q/A oprava po pôvodnom 10-Q bez prepísania histórie', () => {
    // Original 10-Q filed on Nov 4, 2022 at 16:16 ET reporting Net Income = 100M
    const original10Q = createMockFiling({
      id: 'original-10q',
      symbol: 'SIVB',
      form: '10-Q',
      accessNumber: '0000719739-22-000109',
      fiscalYear: 2022,
      fiscalPeriod: 'Q3',
      rawAcceptedStr: '2022-11-04 16:16:32',
      netIncome: 100_000_000,
    });

    // Amendment 10-Q/A filed on Dec 15, 2022 at 17:00 ET restating Net Income = 85M
    const amended10QA = createMockFiling({
      id: 'amended-10qa',
      symbol: 'SIVB',
      form: '10-Q/A',
      accessNumber: '0000719739-22-000150',
      fiscalYear: 2022,
      fiscalPeriod: 'Q3',
      rawAcceptedStr: '2022-12-15 17:00:00',
      netIncome: 85_000_000,
    });

    const dataset = [original10Q, amended10QA];

    // Point in time A: Nov 8, 2022 (Between 10-Q and 10-Q/A)
    const asOfA = parseEasternToUtc('2022-11-08 09:30:00').utcDate;
    const resultA = getPointInTimeFinancialFiling(dataset, {
      symbol: 'SIVB',
      asOf: asOfA,
    });

    expect(resultA).not.toBeNull();
    expect(resultA?.id).toBe('original-10q');
    expect(resultA?.form).toBe('10-Q');
    expect(resultA?.netIncome).toBe(100_000_000); // Must be original 100M, NOT 85M!

    // Point in time B: Dec 20, 2022 (After 10-Q/A was filed)
    const asOfB = parseEasternToUtc('2022-12-20 09:30:00').utcDate;
    const resultB = getPointInTimeFinancialFiling(dataset, {
      symbol: 'SIVB',
      asOf: asOfB,
    });

    expect(resultB).not.toBeNull();
    expect(resultB?.id).toBe('amended-10qa');
    expect(resultB?.form).toBe('10-Q/A');
    expect(resultB?.netIncome).toBe(85_000_000); // Now correctly reflects restatement!

    // Verify Point-in-time universe also preserves restatement lineage
    const universeA = getPointInTimeFinancialUniverse(dataset, 'SIVB', asOfA);
    expect(universeA).toHaveLength(1);
    expect(universeA[0].id).toBe('original-10q');
    expect(universeA[0].netIncome).toBe(100_000_000);

    const universeB = getPointInTimeFinancialUniverse(dataset, 'SIVB', asOfB);
    expect(universeB).toHaveLength(1);
    expect(universeB[0].id).toBe('amended-10qa');
    expect(universeB[0].netIncome).toBe(85_000_000);
  });

  // ---------------------------------------------------------------------------
  // Test 6: DST Prechod (Spring Forward a Fall Back)
  // ---------------------------------------------------------------------------
  it('Scenario 6: DST Prechod (Spring Forward marec a Fall Back november)', () => {
    // 6a: 2024 Spring Forward occurred on March 10, 2024 (clocks jump 02:00 -> 03:00)
    // Before jump (01:30 EST, UTC-5):
    const preSpring = parseEasternToUtc('2024-03-10 01:30:00');
    expect(preSpring.isDst).toBe(false);
    expect(preSpring.offsetMinutes).toBe(-300); // UTC-5
    expect(preSpring.isoUtc).toBe('2024-03-10T06:30:00.000Z');

    // After jump (03:30 EDT, UTC-4):
    const postSpring = parseEasternToUtc('2024-03-10 03:30:00');
    expect(postSpring.isDst).toBe(true);
    expect(postSpring.offsetMinutes).toBe(-240); // UTC-4
    expect(postSpring.isoUtc).toBe('2024-03-10T07:30:00.000Z');

    // 6b: 2024 Fall Back occurred on November 3, 2024 (clocks fall back 02:00 -> 01:00)
    // Afternoon on Nov 3 (03:30 EST, UTC-5):
    const postFall = parseEasternToUtc('2024-11-03 03:30:00');
    expect(postFall.isDst).toBe(false);
    expect(postFall.offsetMinutes).toBe(-300); // UTC-5
    expect(postFall.isoUtc).toBe('2024-11-03T08:30:00.000Z');

    // 6c: Roundtrip format verification
    expect(formatUtcToEastern(preSpring.utcDate)).toBe('2024-03-10 01:30:00');
    expect(formatUtcToEastern(postSpring.utcDate)).toBe('2024-03-10 03:30:00');
    expect(formatUtcToEastern(postFall.utcDate)).toBe('2024-11-03 03:30:00');
  });

  // ---------------------------------------------------------------------------
  // Test 7: As-of okamih pred filingom (Prísny zákaz lookahead biasu)
  // ---------------------------------------------------------------------------
  it('Scenario 7: As-of okamih pred filingom vracia null alebo starší výkaz', () => {
    // AAPL Q3 FY2022 (ended 2022-06-25, filed 2022-07-29)
    const q3Filing = createMockFiling({
      id: 'aapl-q3-2022',
      symbol: 'AAPL',
      fiscalYear: 2022,
      fiscalPeriod: 'Q3',
      endDate: new Date('2022-06-25T00:00:00Z'),
      rawAcceptedStr: '2022-07-29 16:30:00',
      revenue: 82959000000,
    });

    // AAPL FY2022 10-K (ended 2022-09-24, filed 2022-10-27 18:01:14 EDT)
    const fyFiling = createMockFiling({
      id: 'aapl-fy-2022',
      symbol: 'AAPL',
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      endDate: new Date('2022-09-24T00:00:00Z'),
      rawAcceptedStr: '2022-10-27 18:01:14',
      revenue: 394328000000,
    });

    const dataset = [q3Filing, fyFiling];

    // As-of at 2022-10-27 17:00:00 EDT (1 hour BEFORE 10-K filing)
    const asOfBefore = parseEasternToUtc('2022-10-27 17:00:00').utcDate;
    const resultBefore = getPointInTimeFinancialFiling(dataset, {
      symbol: 'AAPL',
      asOf: asOfBefore,
    });

    expect(resultBefore).not.toBeNull();
    expect(resultBefore?.id).toBe('aapl-q3-2022'); // Must return Q3, NOT FY2022!
    expect(resultBefore?.revenue).toBe(82959000000);

    // As-of at 2022-10-27 19:00:00 EDT (1 hour AFTER 10-K filing)
    const asOfAfter = parseEasternToUtc('2022-10-27 19:00:00').utcDate;
    const resultAfter = getPointInTimeFinancialFiling(dataset, {
      symbol: 'AAPL',
      asOf: asOfAfter,
    });

    expect(resultAfter).not.toBeNull();
    expect(resultAfter?.id).toBe('aapl-fy-2022'); // Now returns FY2022!
    expect(resultAfter?.revenue).toBe(394328000000);
  });

  // ---------------------------------------------------------------------------
  // Test 8: Čiastočná oprava (Partial Amendment inheritance)
  // ---------------------------------------------------------------------------
  it('Scenario 8: Čiastočná oprava (10-K/A prepisuje iba čistý zisk, zachováva tržby z 10-K)', () => {
    // Original 10-K with complete financial figures
    const base10K = createMockFiling({
      id: 'base-10k',
      symbol: 'TEST',
      form: '10-K',
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      endDate: new Date('2022-09-30T00:00:00Z'),
      rawAcceptedStr: '2022-10-25 16:30:00',
      revenue: 50_000_000,
      netIncome: 10_000_000,
      totalAssets: 120_000_000,
      totalDebt: 30_000_000,
    });

    // Partial amendment 10-K/A that ONLY restates netIncome and leaves revenue and totalAssets as null!
    const partial10KA = createMockFiling({
      id: 'partial-10ka',
      symbol: 'TEST',
      form: '10-K/A',
      isAmendment: true,
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      endDate: new Date('2022-09-30T00:00:00Z'),
      rawAcceptedStr: '2022-11-20 17:00:00',
      revenue: null, // Did not amend revenue!
      netIncome: 8_500_000, // Restated net income from 10M to 8.5M
      totalAssets: null, // Did not amend assets!
      totalDebt: null,
    });

    const dataset = [base10K, partial10KA];

    // As-of after amendment: Dec 1, 2022
    const asOf = parseEasternToUtc('2022-12-01 09:30:00').utcDate;
    const universe = getPointInTimeFinancialUniverse(dataset, 'TEST', asOf);

    expect(universe).toHaveLength(1);
    const resolved = universe[0];
    // Must inherit restated net income:
    expect(resolved.netIncome).toBe(8_500_000);
    // Must retain original revenue from base 10-K (NOT null!):
    expect(resolved.revenue).toBe(50_000_000);
    // Must retain original totalAssets from base 10-K:
    expect(resolved.totalAssets).toBe(120_000_000);
    // Form and accession come from the amendment:
    expect(resolved.form).toBe('10-K/A');
  });

  // ---------------------------------------------------------------------------
  // Test 9: Dva po sebe nasledujúce restatementy rovnakého obdobia (PMP v3.1.3-C3)
  // ---------------------------------------------------------------------------
  it('Scenario 9: Dva po sebe nasledujúce restatementy rovnakého obdobia s čiastočnou opravou', () => {
    // Version 1: Pôvodný 10-K podaný 2022-10-27 18:01 ET
    const v1_Base10K = createMockFiling({
      id: 'v1-base',
      symbol: 'AAPL',
      form: '10-K',
      accessNumber: '0000320193-22-000108',
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      rawAcceptedStr: '2022-10-27 18:01:14',
      revenue: 394_328_000_000,
      netIncome: 99_803_000_000,
      totalAssets: 352_755_000_000,
      totalDebt: 98_959_000_000,
    });

    // Version 2: Prvá oprava 10-K/A podaná 2022-12-15 17:00 ET (opravuje iba čistý zisk)
    const v2_Amend1 = createMockFiling({
      id: 'v2-amend1',
      symbol: 'AAPL',
      form: '10-K/A',
      accessNumber: '0000320193-22-000150',
      isAmendment: true,
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      rawAcceptedStr: '2022-12-15 17:00:00',
      revenue: null, // neopravuje tržby
      netIncome: 97_500_000_000, // restatement čistého zisku
      totalAssets: null,
      totalDebt: null,
    });

    // Version 3: Druhá oprava 10-K/A podaná 2023-02-10 16:30 ET (opravuje iba tržby)
    const v3_Amend2 = createMockFiling({
      id: 'v3-amend2',
      symbol: 'AAPL',
      form: '10-K/A',
      accessNumber: '0000320193-23-000010',
      isAmendment: true,
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      rawAcceptedStr: '2023-02-10 16:30:00',
      revenue: 392_000_000_000, // restatement tržieb
      netIncome: null, // neopravuje čistý zisk
      totalAssets: null,
      totalDebt: null,
    });

    const dataset = [v1_Base10K, v2_Amend1, v3_Amend2];

    // Epocha T0: Pred prvým podaním (2022-10-27 12:00 ET) -> nesmie vidieť NIČ
    const t0 = parseEasternToUtc('2022-10-27 12:00:00').utcDate;
    const resT0 = getPointInTimeFinancialUniverse(dataset, 'AAPL', t0);
    expect(resT0).toHaveLength(0);

    // Epocha T1: Po pôvodnom 10-K, pred 1. opravou (2022-11-08 09:30 ET) -> pôvodné čísla
    const t1 = parseEasternToUtc('2022-11-08 09:30:00').utcDate;
    const resT1 = getPointInTimeFinancialUniverse(dataset, 'AAPL', t1);
    expect(resT1).toHaveLength(1);
    expect(resT1[0].id).toBe('v1-base');
    expect(resT1[0].netIncome).toBe(99_803_000_000);
    expect(resT1[0].revenue).toBe(394_328_000_000);
    expect(resT1[0].totalAssets).toBe(352_755_000_000);

    // Epocha T2: Po 1. oprave, pred 2. opravou (2023-01-15 09:30 ET) -> zisk opravený, tržby z V1
    const t2 = parseEasternToUtc('2023-01-15 09:30:00').utcDate;
    const resT2 = getPointInTimeFinancialUniverse(dataset, 'AAPL', t2);
    expect(resT2).toHaveLength(1);
    expect(resT2[0].form).toBe('10-K/A');
    expect(resT2[0].netIncome).toBe(97_500_000_000); // restated
    expect(resT2[0].revenue).toBe(394_328_000_000); // inherited from V1
    expect(resT2[0].totalAssets).toBe(352_755_000_000); // inherited from V1

    // Epocha T3: Po 2. oprave (2023-03-10 09:30 ET) -> tržby z V3, zisk z V2, aktíva z V1
    const t3 = parseEasternToUtc('2023-03-10 09:30:00').utcDate;
    const resT3 = getPointInTimeFinancialUniverse(dataset, 'AAPL', t3);
    expect(resT3).toHaveLength(1);
    expect(resT3[0].form).toBe('10-K/A');
    expect(resT3[0].netIncome).toBe(97_500_000_000); // inherited from V2
    expect(resT3[0].revenue).toBe(392_000_000_000); // restated in V3
    expect(resT3[0].totalAssets).toBe(352_755_000_000); // inherited from V1
    expect(resT3[0].totalDebt).toBe(98_959_000_000); // inherited from V1
  });

  // ---------------------------------------------------------------------------
  // Test 10: Kvartálne normalizovanie tokov 3M / 6M / 9M / 12M a TTM (PMP v3.1.3-C3)
  // ---------------------------------------------------------------------------
  it('Scenario 10: Kvartálne diskrétne toky (Q1, Q2=6M-3M, Q3=9M-6M, Q4=12M-9M) a súvahové stavy', () => {
    // Filings for fiscal year 2022

    // Q1 reported (standalone 3M): Rev = 100M, NI = 25M, Assets = 1000M
    const q1 = createMockFiling({
      id: 'q1',
      fiscalYear: 2022,
      fiscalPeriod: 'Q1',
      endDate: new Date('2022-03-31T00:00:00Z'),
      revenue: 100_000_000,
      netIncome: 25_000_000,
      totalAssets: 1_000_000_000,
      cashAndEquivalents: 200_000_000,
    });

    // Q2 reported cumulative 6M: Rev = 220M (Q2 discrete = 120M), NI = 55M (Q2 discrete = 30M), Assets = 1050M
    const q2 = createMockFiling({
      id: 'q2',
      fiscalYear: 2022,
      fiscalPeriod: 'Q2',
      endDate: new Date('2022-06-30T00:00:00Z'),
      revenue: 220_000_000,
      netIncome: 55_000_000,
      totalAssets: 1_050_000_000,
      cashAndEquivalents: 250_000_000,
    });

    // Q3 reported cumulative 9M: Rev = 350M (Q3 discrete = 130M), NI = 90M (Q3 discrete = 35M), Assets = 1100M
    const q3 = createMockFiling({
      id: 'q3',
      fiscalYear: 2022,
      fiscalPeriod: 'Q3',
      endDate: new Date('2022-09-30T00:00:00Z'),
      revenue: 350_000_000,
      netIncome: 90_000_000,
      totalAssets: 1_100_000_000,
      cashAndEquivalents: 300_000_000,
    });

    // FY reported full 12M: Rev = 500M (Q4 discrete = 500M - 350M = 150M), NI = 130M (Q4 discrete = 130M - 90M = 40M)
    const fy = createMockFiling({
      id: 'fy',
      form: '10-K',
      fiscalYear: 2022,
      fiscalPeriod: 'FY',
      endDate: new Date('2022-12-31T00:00:00Z'),
      revenue: 500_000_000,
      netIncome: 130_000_000,
      totalAssets: 1_200_000_000,
      cashAndEquivalents: 400_000_000,
    });

    const normalizedMap = normalizeFiscalYearQuarterlyFlows([q1, q2, q3, fy]);

    // Check discrete quarterly flows
    const normQ1 = normalizedMap.get('Q1');
    expect(normQ1.discreteRevenue).toBe(100_000_000);
    expect(normQ1.discreteNetIncome).toBe(25_000_000);
    expect(normQ1.totalAssets).toBe(1_000_000_000); // Instant NOT subtracted!

    const normQ2 = normalizedMap.get('Q2');
    expect(normQ2.discreteRevenue).toBe(120_000_000); // 220M - 100M
    expect(normQ2.discreteNetIncome).toBe(30_000_000); // 55M - 25M
    expect(normQ2.totalAssets).toBe(1_050_000_000); // Instant NOT subtracted!

    const normQ3 = normalizedMap.get('Q3');
    expect(normQ3.discreteRevenue).toBe(130_000_000); // 350M - 220M
    expect(normQ3.discreteNetIncome).toBe(35_000_000); // 90M - 55M
    expect(normQ3.totalAssets).toBe(1_100_000_000);

    const normQ4 = normalizedMap.get('Q4');
    expect(normQ4.discreteRevenue).toBe(150_000_000); // 500M - 350M
    expect(normQ4.discreteNetIncome).toBe(40_000_000); // 130M - 90M
    expect(normQ4.totalAssets).toBe(1_200_000_000);

    // Verify TTM sum = Q1 + Q2 + Q3 + Q4 = 100 + 120 + 130 + 150 = 500M Revenue, 25 + 30 + 35 + 40 = 130M Net Income
    const quartersArray = [normQ4, normQ3, normQ2, normQ1];
    const ttm = calculatePointInTimeTTM(quartersArray);
    expect(ttm.ttmRevenue).toBe(500_000_000);
    expect(ttm.ttmNetIncome).toBe(130_000_000);
    expect(ttm.quartersCount).toBe(4);
  });
});


