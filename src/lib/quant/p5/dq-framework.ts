/**
 * dq-framework.ts
 *
 * Unified PIT Data Quality (DQ) Framework — core library.
 *
 * Provides the abstract DQCheck, DQResult/DQReport interfaces, CoverageMatrix,
 * and DQRunner that aggregates checks across all PIT domains (identity, prices,
 * fundamentals, earnings, cross-domain) into a single report.
 *
 * Design principles:
 *   - Every check maps to one DQ dimension and one domain.
 *   - Severity drives exit codes (critical → exit 1, warning → exit 2).
 *   - Reports are serializable to JSON for before/after comparison.
 *   - No domain-specific logic here — concrete checks live in dq-checks.ts.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type DQDomain =
    | 'identity'
    | 'prices'
    | 'fundamentals'
    | 'earnings'
    | 'cross-domain';

export type DQSeverity = 'critical' | 'warning' | 'info';

export type DQDimension =
    | 'completeness'
    | 'temporal-correctness'
    | 'identity-consistency'
    | 'cross-domain-consistency'
    | 'provenance'
    | 'uniqueness'
    | 'validity';

export interface DQResult {
    /** ID of the check that produced this result. */
    checkId: string;
    /** Whether the check passed (metric meets or exceeds threshold). */
    passed: boolean;
    /** The measured value (e.g. number of violations, coverage percentage). */
    metric: number;
    /** The threshold the metric must meet to pass. */
    threshold: number;
    /** Comparison operator: how metric relates to threshold. */
    operator: '<=' | '>=' | '==' | '<' | '>';
    /** Human-readable details for debugging. */
    details: Record<string, unknown>;
    /** Execution time in milliseconds. */
    durationMs: number;
}

export interface CoverageRow {
    domain: DQDomain;
    totalExpected: number;
    actual: number;
    coveragePct: number;
    pitValidPct: number;
    gaps: number;
}

export interface CoverageMatrix {
    domains: CoverageRow[];
}

export interface DQReport {
    timestamp: string;
    checks: DQResult[];
    coverage: CoverageMatrix;
    summary: DQSummary;
    exitCode: number;
}

export interface DQSummary {
    totalChecks: number;
    passed: number;
    failed: number;
    criticalFailed: number;
    warningFailed: number;
    infoFailed: number;
    overallVerdict: 'PASS' | 'CRITICAL_FAIL' | 'WARNING_ONLY';
}

export interface ComparisonReport {
    previousTimestamp: string;
    currentTimestamp: string;
    newlyPassing: string[];
    newlyFailing: string[];
    coverageDeltas: Array<{
        domain: DQDomain;
        coverageDelta: number;
        pitValidDelta: number;
        gapsDelta: number;
    }>;
}

// ─── DQCheck (abstract) ────────────────────────────────────────────────────

export abstract class DQCheck {
    abstract readonly id: string;
    abstract readonly domain: DQDomain;
    abstract readonly description: string;
    abstract readonly severity: DQSeverity;
    abstract readonly dimension: DQDimension;

    /**
     * Run the check and return a DQResult.
     * The implementor is responsible for setting `passed`, `metric`, `threshold`,
     * `operator`, and `details`.
     */
    abstract run(): Promise<DQResult>;
}

// ─── DQRunner ──────────────────────────────────────────────────────────────

export class DQRunner {
    private checks: DQCheck[] = [];
    private coverageProvider: (() => Promise<CoverageMatrix>) | null = null;

    /**
     * Register a DQ check. Checks are executed in registration order.
     */
    register(check: DQCheck): void {
        this.checks.push(check);
    }

    /**
     * Register multiple checks at once.
     */
    registerAll(checks: DQCheck[]): void {
        for (const c of checks) this.register(c);
    }

    /**
     * Set a coverage matrix provider. Called once after all checks run.
     * If not set, coverage will be empty.
     */
    setCoverageProvider(provider: () => Promise<CoverageMatrix>): void {
        this.coverageProvider = provider;
    }

    /**
     * Run all registered checks and produce a DQReport.
     */
    async runAll(): Promise<DQReport> {
        const results: DQResult[] = [];

        for (const check of this.checks) {
            const start = Date.now();
            try {
                const result = await check.run();
                result.durationMs = Date.now() - start;
                results.push(result);
            } catch (err) {
                // A check that throws is a critical failure
                results.push({
                    checkId: check.id,
                    passed: false,
                    metric: -1,
                    threshold: 0,
                    operator: '==',
                    details: { error: err instanceof Error ? err.message : String(err) },
                    durationMs: Date.now() - start,
                });
            }
        }

        const coverage = this.coverageProvider
            ? await this.coverageProvider()
            : { domains: [] };

        const summary = this.computeSummary(results);
        const exitCode = this.computeExitCode(results);

        return {
            timestamp: new Date().toISOString(),
            checks: results,
            coverage,
            summary,
            exitCode,
        };
    }

    /**
     * Compute summary statistics from check results.
     */
    private computeSummary(results: DQResult[]): DQSummary {
        let passed = 0;
        let criticalFailed = 0;
        let warningFailed = 0;
        let infoFailed = 0;

        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const check = this.checks[i];
            if (result.passed) {
                passed++;
            } else {
                if (check.severity === 'critical') criticalFailed++;
                else if (check.severity === 'warning') warningFailed++;
                else infoFailed++;
            }
        }

        const failed = results.length - passed;
        const overallVerdict: DQSummary['overallVerdict'] =
            criticalFailed > 0 ? 'CRITICAL_FAIL'
            : warningFailed > 0 || infoFailed > 0 ? 'WARNING_ONLY'
            : 'PASS';

        return {
            totalChecks: results.length,
            passed,
            failed,
            criticalFailed,
            warningFailed,
            infoFailed,
            overallVerdict,
        };
    }

    /**
     * Compute exit code: 0 = all pass, 1 = critical fail, 2 = warning only.
     */
    private computeExitCode(results: DQResult[]): number {
        let hasCritical = false;
        let hasWarning = false;

        for (let i = 0; i < results.length; i++) {
            if (results[i].passed) continue;
            const check = this.checks[i];
            if (check.severity === 'critical') hasCritical = true;
            else hasWarning = true;
        }

        if (hasCritical) return 1;
        if (hasWarning) return 2;
        return 0;
    }

    // ─── Formatters ─────────────────────────────────────────────────────────

    /**
     * Format a DQReport as human-readable text for console output.
     */
    static formatText(report: DQReport): string {
        const lines: string[] = [];
        const sep = '═'.repeat(78);

        lines.push(sep);
        lines.push('  UNIFIED PIT DATA QUALITY REPORT');
        lines.push(`  Timestamp: ${report.timestamp}`);
        lines.push(sep);
        lines.push('');

        // Summary
        const s = report.summary;
        lines.push('── SUMMARY ──────────────────────────────────────────────────────────────');
        lines.push(`  Total checks:  ${s.totalChecks}`);
        lines.push(`  Passed:        ${s.passed}`);
        lines.push(`  Failed:        ${s.failed} (critical: ${s.criticalFailed}, warning: ${s.warningFailed}, info: ${s.infoFailed})`);
        lines.push(`  Verdict:       ${s.overallVerdict}`);
        lines.push(`  Exit code:     ${report.exitCode}`);
        lines.push('');

        // Coverage matrix
        if (report.coverage.domains.length > 0) {
            lines.push('── COVERAGE MATRIX ───────────────────────────────────────────────────────');
            const header = 'Domain'.padEnd(16) + '| Total   | Actual  | Coverage | PIT-Valid | Gaps';
            const divider = '-'.repeat(16) + '+' + '-'.repeat(9) + '+' + '-'.repeat(9) + '+' + '-'.repeat(10) + '+' + '-'.repeat(11) + '+' + '-'.repeat(8);
            lines.push(header);
            lines.push(divider);
            for (const row of report.coverage.domains) {
                lines.push(
                    row.domain.padEnd(16) + '|' +
                    String(row.totalExpected).padStart(8) + ' |' +
                    String(row.actual).padStart(8) + ' |' +
                    `${row.coveragePct.toFixed(1)}%`.padStart(9) + ' |' +
                    `${row.pitValidPct.toFixed(1)}%`.padStart(10) + ' |' +
                    String(row.gaps).padStart(7)
                );
            }
            lines.push('');
        }

        // Per-check results grouped by domain
        const domainOrder: DQDomain[] = ['identity', 'prices', 'fundamentals', 'earnings', 'cross-domain'];
        for (const domain of domainOrder) {
            const domainResults = report.checks.filter((_, idx) =>
                idx < report.checks.length && this.getDomainForCheck(report, idx) === domain
            );
            if (domainResults.length === 0) continue;

            lines.push(`── ${domain.toUpperCase()} CHECKS ───────────────────────────────────────────────────`);
            for (let i = 0; i < report.checks.length; i++) {
                if (this.getDomainForCheck(report, i) !== domain) continue;
                const r = report.checks[i];
                const mark = r.passed ? '✅' : '❌';
                const detailStr = Object.keys(r.details).length > 0
                    ? ' — ' + JSON.stringify(r.details)
                    : '';
                lines.push(`  ${mark} ${r.checkId}: ${r.metric}${r.operator}${r.threshold}${detailStr} (${r.durationMs}ms)`);
            }
            lines.push('');
        }

        lines.push(sep);
        if (s.overallVerdict === 'PASS') {
            lines.push('  ✅ ALL DQ CHECKS PASSED');
        } else if (s.overallVerdict === 'CRITICAL_FAIL') {
            lines.push(`  ❌ ${s.criticalFailed} CRITICAL CHECK(S) FAILED`);
        } else {
            lines.push(`  ⚠️  ${s.warningFailed + s.infoFailed} WARNING/INFO CHECK(S) FAILED (no critical)`);
        }
        lines.push(sep);

        return lines.join('\n');
    }

    /**
     * Helper: get the domain for a check at index i in the report.
     * Since DQReport doesn't store domain per result, we rely on the runner
     * having the same order. For the formatter we use the details if available,
     * otherwise we infer from checkId prefix.
     */
    private static getDomainForCheck(report: DQReport, idx: number): DQDomain {
        const checkId = report.checks[idx].checkId;
        if (checkId.startsWith('IDENT')) return 'identity';
        if (checkId.startsWith('PRICE')) return 'prices';
        if (checkId.startsWith('FUND')) return 'fundamentals';
        if (checkId.startsWith('EARN')) return 'earnings';
        if (checkId.startsWith('XDOM')) return 'cross-domain';
        return 'identity';
    }

    /**
     * Format a DQReport as JSON string.
     */
    static formatJson(report: DQReport): string {
        return JSON.stringify(report, null, 2);
    }

    /**
     * Format a DQReport as Markdown for documentation/PR reviews.
     */
    static formatMarkdown(report: DQReport): string {
        const lines: string[] = [];
        const s = report.summary;

        lines.push('# PIT Data Quality Report');
        lines.push('');
        lines.push(`**Timestamp:** ${report.timestamp}`);
        lines.push(`**Verdict:** ${s.overallVerdict}`);
        lines.push(`**Exit Code:** ${report.exitCode}`);
        lines.push('');

        lines.push('## Summary');
        lines.push('');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Total checks | ${s.totalChecks} |`);
        lines.push(`| Passed | ${s.passed} |`);
        lines.push(`| Failed | ${s.failed} |`);
        lines.push(`| Critical failed | ${s.criticalFailed} |`);
        lines.push(`| Warning failed | ${s.warningFailed} |`);
        lines.push(`| Info failed | ${s.infoFailed} |`);
        lines.push('');

        if (report.coverage.domains.length > 0) {
            lines.push('## Coverage Matrix');
            lines.push('');
            lines.push('| Domain | Total Expected | Actual | Coverage % | PIT-Valid % | Gaps |');
            lines.push('|--------|---------------|--------|-----------|-------------|------|');
            for (const row of report.coverage.domains) {
                lines.push(`| ${row.domain} | ${row.totalExpected} | ${row.actual} | ${row.coveragePct.toFixed(1)}% | ${row.pitValidPct.toFixed(1)}% | ${row.gaps} |`);
            }
            lines.push('');
        }

        lines.push('## Check Results');
        lines.push('');
        lines.push('| Check ID | Passed | Metric | Threshold | Details | Duration |');
        lines.push('|----------|--------|--------|-----------|---------|----------|');
        for (const r of report.checks) {
            const detailsStr = Object.keys(r.details).length > 0
                ? JSON.stringify(r.details).replace(/\|/g, '\\|')
                : '';
            lines.push(`| ${r.checkId} | ${r.passed ? '✅' : '❌'} | ${r.metric} | ${r.operator}${r.threshold} | ${detailsStr} | ${r.durationMs}ms |`);
        }
        lines.push('');

        return lines.join('\n');
    }

    /**
     * Compare two reports and produce a delta.
     */
    static compare(prev: DQReport, curr: DQReport): ComparisonReport {
        const prevMap = new Map(prev.checks.map(r => [r.checkId, r]));
        const currMap = new Map(curr.checks.map(r => [r.checkId, r]));

        const newlyPassing: string[] = [];
        const newlyFailing: string[] = [];

        for (const [id, currResult] of currMap) {
            const prevResult = prevMap.get(id);
            if (!prevResult) continue;
            if (!prevResult.passed && currResult.passed) newlyPassing.push(id);
            if (prevResult.passed && !currResult.passed) newlyFailing.push(id);
        }

        const coverageDeltas: ComparisonReport['coverageDeltas'] = [];
        const prevCov = new Map(prev.coverage.domains.map(d => [d.domain, d]));
        for (const currRow of curr.coverage.domains) {
            const prevRow = prevCov.get(currRow.domain);
            if (!prevRow) continue;
            coverageDeltas.push({
                domain: currRow.domain,
                coverageDelta: currRow.coveragePct - prevRow.coveragePct,
                pitValidDelta: currRow.pitValidPct - prevRow.pitValidPct,
                gapsDelta: currRow.gaps - prevRow.gaps,
            });
        }

        return {
            previousTimestamp: prev.timestamp,
            currentTimestamp: curr.timestamp,
            newlyPassing,
            newlyFailing,
            coverageDeltas,
        };
    }

    /**
     * Format a ComparisonReport as text.
     */
    static formatComparisonText(comp: ComparisonReport): string {
        const lines: string[] = [];
        lines.push('── BEFORE/AFTER COMPARISON ────────────────────────────────────────────────');
        lines.push(`  Previous: ${comp.previousTimestamp}`);
        lines.push(`  Current:  ${comp.currentTimestamp}`);
        lines.push('');

        if (comp.newlyPassing.length > 0) {
            lines.push('  ✅ Newly PASSING (regressions fixed):');
            for (const id of comp.newlyPassing) lines.push(`     ${id}`);
        } else {
            lines.push('  No newly passing checks.');
        }

        if (comp.newlyFailing.length > 0) {
            lines.push('  ❌ Newly FAILING (regressions introduced):');
            for (const id of comp.newlyFailing) lines.push(`     ${id}`);
        } else {
            lines.push('  No newly failing checks.');
        }
        lines.push('');

        if (comp.coverageDeltas.length > 0) {
            lines.push('  Coverage deltas:');
            for (const d of comp.coverageDeltas) {
                const covSign = d.coverageDelta >= 0 ? '+' : '';
                const gapSign = d.gapsDelta >= 0 ? '+' : '';
                lines.push(`     ${d.domain}: coverage ${covSign}${d.coverageDelta.toFixed(1)}%, gaps ${gapSign}${d.gapsDelta}`);
            }
        }
        lines.push('');

        return lines.join('\n');
    }
}
