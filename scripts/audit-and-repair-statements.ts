/**
 * Financial Statements Audit & Repair Tool
 *
 * Checks:
 *  1. Balance sheet integrity: |TotalAssets - (TotalLiabilities + TotalEquity)|.
 *     Logs a warning if deviation > 1% and totalAssets is non-zero.
 *  2. Missing key fields: revenue, netIncome, operatingCashFlow, totalAssets.
 *  3. Derivation / Repair (--fix):
 *     - Fills missing totalLiabilities = totalAssets - totalEquity (when assets & equity present)
 *     - Fills missing totalEquity = totalAssets - totalLiabilities (when assets & liabilities present)
 *     - Fills missing totalAssets = totalLiabilities + totalEquity (when liabilities & equity present)
 *     - Normalizes negative capex to positive magnitude (|capex|)
 *
 * Usage:
 *   npx tsx scripts/audit-and-repair-statements.ts [--symbol=XYZ] [--fix] [--limit=N] [--verbose]
 */

import { loadEnvFromFiles } from './_utils/loadEnv';

loadEnvFromFiles();

import { prisma } from '../src/lib/db/prisma';
import { dbWriteRetry as dbWrite } from '../src/lib/db/writeRetry';
import type { FinancialStatement, Prisma } from '@prisma/client';

export const KEY_FIELDS = ['revenue', 'netIncome', 'operatingCashFlow', 'totalAssets'] as const;

export interface StatementAuditAnomaly {
    symbol: string;
    fiscalYear: number;
    fiscalPeriod: string;
    endDate: Date;
    type: 'BALANCE_MISMATCH' | 'MISSING_KEY_FIELDS';
    details: string;
    diff?: number;
    pctDiff?: number;
    missingFields?: string[];
}

export interface StatementDerivedPatch {
    totalLiabilities?: number;
    totalEquity?: number;
    totalAssets?: number;
    capex?: number;
}

export interface AuditSummary {
    totalChecked: number;
    anomaliesCount: number;
    balanceAnomaliesCount: number;
    missingFieldsAnomaliesCount: number;
    rowsFixed: number;
    fixEnabled: boolean;
}

/**
 * Checks balance sheet equation integrity: |Assets - (Liabilities + Equity)| / |Assets| > 1%
 */
export function checkBalanceIntegrity(
    stmt: Pick<FinancialStatement, 'totalAssets' | 'totalLiabilities' | 'totalEquity'>
): {
    hasMismatch: boolean;
    diff: number;
    pctDiff: number;
} {
    const { totalAssets, totalLiabilities, totalEquity } = stmt;
    if (
        totalAssets === null ||
        totalAssets === 0 ||
        totalLiabilities === null ||
        totalEquity === null
    ) {
        return { hasMismatch: false, diff: 0, pctDiff: 0 };
    }

    const diff = Math.abs(totalAssets - (totalLiabilities + totalEquity));
    const pctDiff = (diff / Math.abs(totalAssets)) * 100;
    const hasMismatch = pctDiff > 1.0;

    return { hasMismatch, diff, pctDiff };
}

/**
 * Checks for missing key fields: revenue, netIncome, operatingCashFlow, totalAssets
 */
export function checkMissingKeyFields(
    stmt: Pick<FinancialStatement, 'revenue' | 'netIncome' | 'operatingCashFlow' | 'totalAssets'>
): string[] {
    const missing: string[] = [];
    for (const field of KEY_FIELDS) {
        if (stmt[field] === null || stmt[field] === undefined) {
            missing.push(field);
        }
    }
    return missing;
}

/**
 * Computes derived values when one balance sheet component is missing or capex is negative.
 */
export function deriveMissingStatementFields(
    stmt: Pick<FinancialStatement, 'totalAssets' | 'totalLiabilities' | 'totalEquity' | 'capex'>
): StatementDerivedPatch {
    const patch: StatementDerivedPatch = {};

    if (stmt.totalLiabilities === null && stmt.totalAssets !== null && stmt.totalEquity !== null) {
        patch.totalLiabilities = stmt.totalAssets - stmt.totalEquity;
    } else if (stmt.totalEquity === null && stmt.totalAssets !== null && stmt.totalLiabilities !== null) {
        patch.totalEquity = stmt.totalAssets - stmt.totalLiabilities;
    } else if (stmt.totalAssets === null && stmt.totalLiabilities !== null && stmt.totalEquity !== null) {
        patch.totalAssets = stmt.totalLiabilities + stmt.totalEquity;
    }

    if (stmt.capex !== null && stmt.capex < 0) {
        patch.capex = Math.abs(stmt.capex);
    }

    return patch;
}

/**
 * Core auditing and repair routine for an array of statements.
 */
export async function auditAndRepairStatements(
    statements: FinancialStatement[],
    options: { fix?: boolean; verbose?: boolean } = {}
): Promise<{ summary: AuditSummary; anomalies: StatementAuditAnomaly[] }> {
    const { fix = false, verbose = false } = options;
    const anomalies: StatementAuditAnomaly[] = [];
    let balanceAnomaliesCount = 0;
    let missingFieldsAnomaliesCount = 0;
    let rowsFixed = 0;

    for (const stmt of statements) {
        let hasAnomalyOnRow = false;

        // 1. Balance sheet integrity check
        const { hasMismatch, diff, pctDiff } = checkBalanceIntegrity(stmt);
        if (hasMismatch) {
            hasAnomalyOnRow = true;
            balanceAnomaliesCount++;
            const details = `Bilančná odchýlka ${pctDiff.toFixed(2)}% (|Assets - (Liab + Equity)| = ${diff.toLocaleString()}, Assets = ${stmt.totalAssets?.toLocaleString()}, Liab = ${stmt.totalLiabilities?.toLocaleString()}, Equity = ${stmt.totalEquity?.toLocaleString()})`;
            console.warn(`[WARN][BALANCE_MISMATCH] ${stmt.symbol} ${stmt.fiscalPeriod}/${stmt.fiscalYear} (${stmt.endDate.toISOString().split('T')[0]}): ${details}`);
            anomalies.push({
                symbol: stmt.symbol,
                fiscalYear: stmt.fiscalYear,
                fiscalPeriod: stmt.fiscalPeriod,
                endDate: stmt.endDate,
                type: 'BALANCE_MISMATCH',
                details,
                diff,
                pctDiff,
            });
        }

        // 2. Missing key fields detection
        const missingFields = checkMissingKeyFields(stmt);
        if (missingFields.length > 0) {
            hasAnomalyOnRow = true;
            missingFieldsAnomaliesCount++;
            const details = `Chýbajúce kľúčové polia: [${missingFields.join(', ')}]`;
            if (verbose || hasMismatch) {
                console.warn(`[WARN][MISSING_FIELDS] ${stmt.symbol} ${stmt.fiscalPeriod}/${stmt.fiscalYear}: ${details}`);
            }
            anomalies.push({
                symbol: stmt.symbol,
                fiscalYear: stmt.fiscalYear,
                fiscalPeriod: stmt.fiscalPeriod,
                endDate: stmt.endDate,
                type: 'MISSING_KEY_FIELDS',
                details,
                missingFields,
            });
        }

        // 3. Derived values / Fix
        const patch = deriveMissingStatementFields(stmt);
        if (Object.keys(patch).length > 0) {
            if (fix) {
                try {
                    await dbWrite(async () => {
                        await prisma.financialStatement.update({
                            where: { id: stmt.id },
                            data: patch,
                        });
                    });
                    rowsFixed++;
                    console.log(`[FIXED] ${stmt.symbol} ${stmt.fiscalPeriod}/${stmt.fiscalYear}: doplnené hodnoty ${JSON.stringify(patch)}`);
                } catch (err: any) {
                    console.error(`[ERROR] ${stmt.symbol} ${stmt.fiscalPeriod}/${stmt.fiscalYear}: zlyhala oprava: ${err?.message}`);
                }
            } else if (verbose) {
                console.log(`[CAN_FIX] ${stmt.symbol} ${stmt.fiscalPeriod}/${stmt.fiscalYear}: možné doplniť ${JSON.stringify(patch)} (spustite s --fix)`);
            }
        }
    }

    const summary: AuditSummary = {
        totalChecked: statements.length,
        anomaliesCount: balanceAnomaliesCount + missingFieldsAnomaliesCount,
        balanceAnomaliesCount,
        missingFieldsAnomaliesCount,
        rowsFixed,
        fixEnabled: fix,
    };

    return { summary, anomalies };
}

// ── CLI Runner ──
async function main() {
    const symbolArg = process.argv.find(a => a.startsWith('--symbol='));
    const limitArg = process.argv.find(a => a.startsWith('--limit='));
    const fix = process.argv.includes('--fix');
    const verbose = process.argv.includes('--verbose');

    const targetSymbol = symbolArg ? symbolArg.split('=')[1]!.trim().toUpperCase() : null;
    const limit = limitArg ? parseInt(limitArg.split('=')[1]!, 10) : undefined;

    console.log(`[audit-statements] Spúšťam audit ${fix ? '(REPAIR MODE --fix)' : '(DRY RUN / AUDIT ONLY)'}`);
    if (targetSymbol) console.log(`[audit-statements] Filter symbol: ${targetSymbol}`);
    if (limit) console.log(`[audit-statements] Limit záznamov: ${limit}`);

    const where: Prisma.FinancialStatementWhereInput = {};
    if (targetSymbol) where.symbol = targetSymbol;

    const statements = await prisma.financialStatement.findMany({
        where,
        orderBy: [{ symbol: 'asc' }, { fiscalYear: 'desc' }, { fiscalPeriod: 'desc' }],
        ...(limit ? { take: limit } : {}),
    });

    console.log(`[audit-statements] Načítaných ${statements.length} výkazov z databázy.`);

    const { summary } = await auditAndRepairStatements(statements, { fix, verbose });

    console.log('\n' + '='.repeat(72));
    console.log('              FINANCIAL STATEMENTS AUDIT & REPAIR SUMMARY              ');
    console.log('='.repeat(72));
    console.log(`Počet skontrolovaných výkazov:       ${summary.totalChecked}`);
    console.log(`Počet zistených anomálií:            ${summary.anomaliesCount}`);
    console.log(`  - Bilančné odchýlky (> 1%):        ${summary.balanceAnomaliesCount}`);
    console.log(`  - Chýbajúce kľúčové polia:         ${summary.missingFieldsAnomaliesCount}`);
    console.log(`Počet opravených riadkov:            ${summary.rowsFixed} ${summary.fixEnabled ? '(zapísané do DB)' : '(spustite s --fix pre zápis do DB)'}`);
    console.log('='.repeat(72) + '\n');
}

// Execute when run directly as CLI
const isDirectRun = process.argv[1]?.endsWith('audit-and-repair-statements.ts');
if (isDirectRun) {
    main()
        .then(() => {
            process.exit(0);
        })
        .catch(err => {
            console.error('Audit failed with error:', err);
            process.exit(1);
        });
}
