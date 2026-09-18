/**
 * Prisma Consensus Store — DB-backed ConsensusIngestStore
 * =========================================================
 *
 * The Postgres half of the vendor-neutral ingest pipeline. Implements
 * the minimal ConsensusIngestStore surface over Prisma so
 * runCanonicalIngest() can persist to PitConsensusFact /
 * PitConsensusRevision idempotently (dedup by sourceRecordHash).
 *
 * Also exports the PIT-correct TickerResolver over PitTickerHistory.
 */

import { PrismaClient } from '../db/client';
import {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
  ConsensusIngestStore,
  TickerResolver,
} from './consensus-ingest-types';

export class PrismaConsensusStore implements ConsensusIngestStore {
  constructor(private prisma: PrismaClient) {}

  async insertFactIfAbsent(fact: ConsensusFactInsert): Promise<boolean> {
    const existing = await this.prisma.pitConsensusFact.findFirst({
      where: { sourceRecordHash: fact.sourceRecordHash },
      select: { id: true },
    });
    if (existing) return false;
    await this.prisma.pitConsensusFact.create({
      data: {
        securityId: fact.securityId,
        fiscalYear: fact.fiscalYear,
        fiscalPeriod: fact.fiscalPeriod,
        periodEndDate: fact.periodEndDate,
        observationDate: fact.observationDate,
        availableAt: fact.availableAt,
        supersededAt: fact.supersededAt ?? new Date('9999-12-31T23:59:59Z'),
        metricType: fact.metricType,
        consensusMean: fact.consensusMean,
        consensusMedian: fact.consensusMedian,
        consensusHigh: fact.consensusHigh,
        consensusLow: fact.consensusLow,
        consensusStdDev: fact.consensusStdDev,
        analystCount: fact.analystCount,
        actualValue: fact.actualValue,
        actualReportDate: fact.actualReportDate,
        sourceProvider: fact.sourceProvider,
        sourceType: fact.sourceType,
        sourceRecordHash: fact.sourceRecordHash,
      },
    });
    return true;
  }

  async insertRevisionIfAbsent(revision: ConsensusRevisionInsert): Promise<boolean> {
    const existing = await this.prisma.pitConsensusRevision.findFirst({
      where: { sourceRecordHash: revision.sourceRecordHash },
      select: { id: true },
    });
    if (existing) return false;
    await this.prisma.pitConsensusRevision.create({
      data: {
        securityId: revision.securityId,
        fiscalYear: revision.fiscalYear,
        fiscalPeriod: revision.fiscalPeriod,
        periodEndDate: revision.periodEndDate,
        revisionDate: revision.revisionDate,
        availableAt: revision.availableAt,
        analystId: revision.analystId,
        analystName: revision.analystName,
        metricType: revision.metricType,
        priorEstimate: revision.priorEstimate,
        newEstimate: revision.newEstimate,
        sourceProvider: revision.sourceProvider,
        sourceType: revision.sourceType,
        sourceRecordHash: revision.sourceRecordHash,
      },
    });
    return true;
  }
}

/**
 * PIT-correct ticker resolver over PitTickerHistory:
 * a ticker resolves to its securityId only while the mapping is active
 * (startDate <= at < endDate) — terminated/delisted tickers stop
 * resolving after their endDate.
 */
export async function buildTickerResolver(prisma: PrismaClient): Promise<TickerResolver> {
  const tickerRows = await prisma.pitTickerHistory.findMany({
    select: { ticker: true, securityId: true, startDate: true, endDate: true },
  });
  return {
    resolve(ticker: string, at: Date): string | null {
      const t = ticker.toUpperCase();
      const atMs = at.getTime();
      const match = tickerRows.find(
        r =>
          r.ticker.toUpperCase() === t &&
          r.startDate.getTime() <= atMs &&
          (r.endDate === null || atMs < r.endDate.getTime()),
      );
      return match ? match.securityId : null;
    },
  };
}
