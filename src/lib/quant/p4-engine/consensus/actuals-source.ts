/**
 * PIT Actuals Source — Reported EPS / Revenue Interface
 * ======================================================
 *
 * V5-C surprise features need to pair pre-report consensus with the
 * REALIZED value the company actually reported:
 *
 *   epsSurprisePct      = (actualEps      - preReportConsensusEps)     / |consensus| * 100
 *   revenueSurprisePct  = (actualRevenue  - preReportConsensusRevenue) / |consensus| * 100
 *
 * What the interface must provide (frozen contract):
 *   - actualValue       reported EPS (diluted) or revenue for the fiscal period
 *   - actualReportDate  when the actual became public (PIT: surprise only
 *                       exists at T if reportDate <= T)
 *   - availableAt       when the record was knowable to our system
 *   - provenance        sourceForm / accession for the audit chain
 *
 * Vendor estimates datasets (e.g. Nasdaq EEH) are estimates-only — they
 * do NOT carry actuals. The canonical source that CAN satisfy the
 * contract today is our own SEC-derived `PitFundamentalFact`:
 *
 *   actualValue       = epsDiluted   (EPS)     | revenue (REVENUE)
 *   actualReportDate  = publishedAt          (SEC filing publication timestamp)
 *   availableAt       = availableAt          (when the fact entered our store)
 *
 * CAVEAT (documented, conservative): publishedAt is the SEC filing
 * acceptance timestamp. The market-visible report (8-K press release)
 * usually precedes it by hours/days. Using the LATER bound means the
 * "pre-earnings consensus" window may include revisions that already
 * saw the press release — this biases surprise toward zero, i.e. it
 * UNDERSTATES the signal. Conservative, not leaky: no future actual
 * value ever enters a snapshot (validator enforces
 * observationDate >= actualReportDate on actual-carrying rows).
 * If a vendor later provides exact report timestamps, prefer those.
 */

import { PrismaClient } from '../db/client';

export interface PitActual {
  value: number;
  /** When the actual became public (best available PIT bound) */
  reportDate: Date;
  /** When the record was knowable to our system */
  availableAt: Date;
  /** Provenance for the audit chain */
  sourceForm: string | null;
  accessionNum: string | null;
}

export interface PitActualsSource {
  /**
   * The actual reported value for (security, fiscal period, metric),
   * or null when the period has no reported actual in the source.
   * Must be deterministic (same inputs → same output).
   */
  getActual(
    securityId: string,
    fiscalYear: number,
    fiscalPeriod: string,
    metricType: 'EPS' | 'REVENUE',
  ): Promise<PitActual | null>;
}

/**
 * SEC-backed actuals over PitFundamentalFact.
 *
 * Selects the ORIGINAL report of a period (earliest publishedAt among
 * non-superseded facts with the metric present). Restatements create
 * later-published rows; the initial filing is the report event that
 * pairs with pre-report consensus.
 */
export class SecActualsSource implements PitActualsSource {
  constructor(private prisma: PrismaClient) {}

  async getActual(
    securityId: string,
    fiscalYear: number,
    fiscalPeriod: string,
    metricType: 'EPS' | 'REVENUE',
  ): Promise<PitActual | null> {
    const valueWhere =
      metricType === 'EPS' ? { epsDiluted: { not: null } } : { revenue: { not: null } };

    const row = await this.prisma.pitFundamentalFact.findFirst({
      where: {
        securityId,
        fiscalYear,
        fiscalPeriod,
        isRestatement: false,
        ...valueWhere,
      },
      orderBy: { publishedAt: 'asc' },
      select: {
        epsDiluted: true,
        revenue: true,
        publishedAt: true,
        availableAt: true,
        sourceForm: true,
        accessionNum: true,
      },
    });

    if (!row) return null;
    const value = metricType === 'EPS' ? row.epsDiluted : row.revenue;
    if (value === null) return null;

    return {
      value,
      reportDate: row.publishedAt,
      availableAt: row.availableAt,
      sourceForm: row.sourceForm,
      accessionNum: row.accessionNum,
    };
  }
}
