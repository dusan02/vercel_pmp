/**
 * PMP v3.1.3-C3: Multi-Epoch PIT Reconstruction & Export
 * 
 * Reconstructs point-in-time financial state for all 35 tickers across 3 historical epochs:
 * - Epoch 1: 2020-03-23 09:30 EDT (COVID Crash Bottom)
 * - Epoch 2: 2022-11-08 09:30 EST (US Midterm Election Day)
 * - Epoch 3: 2023-03-10 09:30 EST (SVB Bank Run Morning)
 * 
 * Exports to /tmp/pmp-pit-epochs.json and /tmp/pmp-pit-epochs.csv
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { parseEasternToUtc } from '../src/lib/quant/pit/timezone';
import {
  FinancialFilingRecord,
  getPointInTimeFinancialFiling,
} from '../src/lib/quant/pit/pit-filing-service';

const DB_PATH = '/tmp/pmp-pit-cohort.db';

const ALL_35_SYMBOLS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA',
  'SMCI', 'KHC', 'GE', 'WDC', 'EQIX',
  'SIVB', 'TWTR', 'ATVI', 'BBBY', 'FRC', 'SBNY',
  'TSM', 'ASML', 'BHP', 'BP', 'SHEL', 'BABA',
  'JPM', 'BAC', 'XOM', 'UNH', 'CAT', 'LLY', 'JNJ', 'PG', 'COST', 'FDX', 'NKE'
];

interface EpochExportRow {
  epochName: string;
  epochDateUtc: string;
  symbol: string;
  status: 'AVAILABLE' | 'NOT_AVAILABLE';
  form: string;
  fiscalYear: number | null;
  fiscalPeriod: string;
  accession: string;
  acceptedDateUtc: string;
  availableAtUtc: string;
  periodEndDate: string;
  revenue: number | null;
  netIncome: number | null;
  cashAndEquivalents: number | null;
  totalDebt: number | null;
  totalAssets: number | null;
  sharesOutstanding: number | null;
}

function run() {
  const db = new Database(DB_PATH);

  // Load all ingested filings from DB
  const rawFilings = db.prepare('SELECT * FROM FinancialFiling').all();
  const filingsBySymbol = new Map<string, FinancialFilingRecord[]>();

  for (const r of rawFilings as any[]) {
    const sym = r.symbol;
    const list = filingsBySymbol.get(sym) ?? [];
    list.push({
      id: r.id,
      symbol: r.symbol,
      accessNumber: r.accessNumber,
      cik: r.cik,
      form: r.form,
      isAmendment: r.isAmendment === 1,
      fiscalYear: r.fiscalYear,
      fiscalPeriod: r.fiscalPeriod,
      period: r.period,
      startDate: r.startDate ? new Date(r.startDate) : null,
      endDate: new Date(r.endDate),
      filedDate: r.filedDate ? new Date(r.filedDate) : null,
      acceptedDate: new Date(r.acceptedDate),
      availableAt: new Date(r.availableAt),
      rawAcceptedStr: r.rawAcceptedStr,
      rawTimezone: r.rawTimezone,
      source: r.source,
      revenue: r.revenue,
      netIncome: r.netIncome,
      ebit: r.ebit,
      grossProfit: r.grossProfit,
      operatingCashFlow: r.operatingCashFlow,
      capex: r.capex,
      totalAssets: r.totalAssets,
      totalLiabilities: r.totalLiabilities,
      currentAssets: r.currentAssets,
      currentLiabilities: r.currentLiabilities,
      totalEquity: r.totalEquity,
      sharesOutstanding: r.sharesOutstanding,
      cashAndEquivalents: r.cashAndEquivalents,
      totalDebt: r.totalDebt,
    });
    filingsBySymbol.set(sym, list);
  }

  const epochs = [
    {
      name: 'COVID_Crash_2020-03-23',
      date: new Date('2020-03-23T13:30:00.000Z'),
      iso: '2020-03-23T13:30:00.000Z',
    },
    {
      name: 'Midterm_Election_2022-11-08',
      date: new Date('2022-11-08T14:30:00.000Z'),
      iso: '2022-11-08T14:30:00.000Z',
    },
    {
      name: 'SVB_BankRun_2023-03-10',
      date: new Date('2023-03-10T14:30:00.000Z'),
      iso: '2023-03-10T14:30:00.000Z',
    },
  ];

  const exportRows: EpochExportRow[] = [];

  for (const ep of epochs) {
    for (const sym of ALL_35_SYMBOLS) {
      const symFilings = filingsBySymbol.get(sym) || [];
      const pitFiling = getPointInTimeFinancialFiling(symFilings, {
        symbol: sym,
        asOf: ep.date,
      });

      if (pitFiling) {
        exportRows.push({
          epochName: ep.name,
          epochDateUtc: ep.iso,
          symbol: sym,
          status: 'AVAILABLE',
          form: pitFiling.form,
          fiscalYear: pitFiling.fiscalYear,
          fiscalPeriod: pitFiling.fiscalPeriod,
          accession: pitFiling.accessNumber || '',
          acceptedDateUtc: pitFiling.acceptedDate.toISOString(),
          availableAtUtc: pitFiling.availableAt.toISOString(),
          periodEndDate: pitFiling.endDate.toISOString().split('T')[0],
          revenue: pitFiling.revenue,
          netIncome: pitFiling.netIncome,
          cashAndEquivalents: pitFiling.cashAndEquivalents,
          totalDebt: pitFiling.totalDebt,
          totalAssets: pitFiling.totalAssets,
          sharesOutstanding: pitFiling.sharesOutstanding,
        });
      } else {
        exportRows.push({
          epochName: ep.name,
          epochDateUtc: ep.iso,
          symbol: sym,
          status: 'NOT_AVAILABLE',
          form: 'NONE',
          fiscalYear: null,
          fiscalPeriod: 'N/A',
          accession: 'N/A',
          acceptedDateUtc: 'N/A',
          availableAtUtc: 'N/A',
          periodEndDate: 'N/A',
          revenue: null,
          netIncome: null,
          cashAndEquivalents: null,
          totalDebt: null,
          totalAssets: null,
          sharesOutstanding: null,
        });
      }
    }
  }

  // Write exports
  const jsonPath = '/tmp/pmp-pit-epochs.json';
  const csvPath = '/tmp/pmp-pit-epochs.csv';

  fs.writeFileSync(jsonPath, JSON.stringify(exportRows, null, 2), 'utf-8');

  const csvHeader = 'epochName,epochDateUtc,symbol,status,form,fiscalYear,fiscalPeriod,accession,acceptedDateUtc,availableAtUtc,periodEndDate,revenue,netIncome,cashAndEquivalents,totalDebt,totalAssets,sharesOutstanding\n';
  const csvLines = exportRows.map(r =>
    `${r.epochName},${r.epochDateUtc},${r.symbol},${r.status},${r.form},${r.fiscalYear || ''},${r.fiscalPeriod},${r.accession},${r.acceptedDateUtc},${r.availableAtUtc},${r.periodEndDate},${r.revenue || ''},${r.netIncome || ''},${r.cashAndEquivalents || ''},${r.totalDebt || ''},${r.totalAssets || ''},${r.sharesOutstanding || ''}`
  ).join('\n');
  fs.writeFileSync(csvPath, csvHeader + csvLines, 'utf-8');

  console.log(`Generated ${exportRows.length} epoch evaluation rows.`);
  console.log(`Saved JSON: ${jsonPath}`);
  console.log(`Saved CSV:  ${csvPath}`);

  db.close();
}

run();
