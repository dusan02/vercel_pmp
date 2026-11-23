import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

export interface ReadonlyValRow {
  date: Date;
  closePrice: number | null;
  peRatio: number | null;
  psRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  marketCap: number | null;
  peForward: number | null;
}

export interface ReadonlyStatementRow {
  endDate: Date;
  fiscalPeriod: string;
  fiscalYear: number;
  netIncome: number | null;
  sharesOutstanding: number | null;
}

export interface ReadonlyCandlesDbData {
  valRows: ReadonlyValRow[];
  bs: { totalDebt: number | null; cashAndEquivalents: number | null } | null;
  stmts: ReadonlyStatementRow[];
  fm: { forwardPe: number | null; fetchedAt: Date } | null;
  sector: string | null;
}

interface RawValRow {
  date: number | string;
  closePrice: number | null;
  peRatio: number | null;
  psRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  fcfYield: number | null;
  marketCap: number | null;
  peForward: number | null;
}

interface RawStatementRow {
  endDate: number | string;
  fiscalPeriod: string;
  fiscalYear: number;
  netIncome: number | null;
  sharesOutstanding: number | null;
}

interface RawFinnhubMetricsRow {
  forwardPe: number | null;
  fetchedAt: number | string;
}

interface PreparedCandlesStmts {
  ping: Database.Statement<[], { ok: number }>;
  valRows: Database.Statement<[string, number], RawValRow>;
  bs: Database.Statement<[string], { totalDebt: number | null; cashAndEquivalents: number | null }>;
  stmts: Database.Statement<[string], RawStatementRow>;
  fm: Database.Statement<[string], RawFinnhubMetricsRow>;
  sector: Database.Statement<[string], { sector: string | null }>;
}

interface ReadonlySqliteState {
  db: Database.Database;
  prepared: PreparedCandlesStmts;
}

const globalForSqlite = globalThis as unknown as {
  __pmpReadonlySqlite?: ReadonlySqliteState;
};

/** Resolve SQLite file path from DATABASE_URL, stripping file: and query string. */
export function resolveSqliteFilePath(rawUrl?: string): string | null {
  const url = (rawUrl ?? process.env.DATABASE_URL ?? 'file:./prisma/dev.db').trim();
  if (!url.startsWith('file:')) return null;
  const withoutScheme = url.slice(5);
  const pathPart = withoutScheme.split('?')[0]?.trim();
  if (!pathPart) return null;
  if (path.isAbsolute(pathPart)) return pathPart;
  const cwdCandidate = path.resolve(process.cwd(), pathPart);
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  const prismaCandidate = path.resolve(process.cwd(), 'prisma', pathPart);
  if (fs.existsSync(prismaCandidate)) return prismaCandidate;
  return cwdCandidate;
}

/** Convert SQLite epoch-ms integer or ISO string timestamps into Date. */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (/^-?\d+$/.test(trimmed)) return new Date(Number(trimmed));
    return new Date(trimmed);
  }
  return new Date(NaN);
}

function getReadonlyState(): ReadonlySqliteState | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (globalForSqlite.__pmpReadonlySqlite) return globalForSqlite.__pmpReadonlySqlite;

  const dbPath = resolveSqliteFilePath();
  if (!dbPath || !fs.existsSync(dbPath)) return null;

  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma('busy_timeout = 5000');
    db.pragma('cache_size = -16000');
    const prepared: PreparedCandlesStmts = {
      ping: db.prepare('SELECT 1 AS ok'),
      valRows: db.prepare(
        'SELECT date, closePrice, peRatio, psRatio, pbRatio, evEbitda, fcfYield, marketCap, peForward ' +
        'FROM DailyValuationHistory WHERE symbol = ? AND date >= ? ORDER BY date ASC',
      ),
      bs: db.prepare(
        'SELECT totalDebt, cashAndEquivalents FROM FinancialStatement ' +
        'WHERE symbol = ? AND totalDebt IS NOT NULL AND cashAndEquivalents IS NOT NULL ' +
        'ORDER BY endDate DESC LIMIT 1',
      ),
      stmts: db.prepare(
        'SELECT endDate, fiscalPeriod, fiscalYear, netIncome, sharesOutstanding ' +
        'FROM FinancialStatement WHERE symbol = ?',
      ),
      fm: db.prepare(
        'SELECT forwardPe, fetchedAt FROM FinnhubMetrics WHERE symbol = ? LIMIT 1',
      ),
      sector: db.prepare(
        'SELECT sector FROM Ticker WHERE symbol = ? LIMIT 1',
      ),
    };
    globalForSqlite.__pmpReadonlySqlite = { db, prepared };
    return globalForSqlite.__pmpReadonlySqlite;
  } catch {
    return null;
  }
}

/** Fast in-process SQLite health ping bypassing Prisma connection serialization. */
export function pingReadonlySqlite(): boolean {
  const state = getReadonlyState();
  if (!state) return false;
  try {
    const row = state.prepared.ping.get();
    return row?.ok === 1;
  } catch {
    return false;
  }
}

/**
 * Read valuation history, statement/BS inputs, Finnhub metrics and sector for
 * /api/analysis/[ticker]/candles directly via WAL read-only SQLite, bypassing
 * Prisma's single-connection queue under concurrent load. Returns null when
 * unavailable so callers can fall back to Prisma cleanly.
 */
export function readCandlesSqliteData(
  symbol: string,
  fromDate: Date,
): ReadonlyCandlesDbData | null {
  const state = getReadonlyState();
  if (!state) return null;

  try {
    const rawValRows = state.prepared.valRows.all(symbol, fromDate.getTime());
    const valRows: ReadonlyValRow[] = rawValRows.map((r) => ({
      date: toDate(r.date),
      closePrice: r.closePrice ?? null,
      peRatio: r.peRatio ?? null,
      psRatio: r.psRatio ?? null,
      pbRatio: r.pbRatio ?? null,
      evEbitda: r.evEbitda ?? null,
      fcfYield: r.fcfYield ?? null,
      marketCap: r.marketCap ?? null,
      peForward: r.peForward ?? null,
    }));

    const bsRow = state.prepared.bs.get(symbol);
    const bs = bsRow
      ? {
          totalDebt: bsRow.totalDebt ?? null,
          cashAndEquivalents: bsRow.cashAndEquivalents ?? null,
        }
      : null;

    const rawStmts = state.prepared.stmts.all(symbol);
    const stmts: ReadonlyStatementRow[] = rawStmts.map((s) => ({
      endDate: toDate(s.endDate),
      fiscalPeriod: s.fiscalPeriod,
      fiscalYear: s.fiscalYear,
      netIncome: s.netIncome ?? null,
      sharesOutstanding: s.sharesOutstanding ?? null,
    }));

    const fmRow = state.prepared.fm.get(symbol);
    const fm = fmRow
      ? {
          forwardPe: fmRow.forwardPe ?? null,
          fetchedAt: toDate(fmRow.fetchedAt),
        }
      : null;

    const sectorRow = state.prepared.sector.get(symbol);
    const sector = sectorRow?.sector ?? null;

    return { valRows, bs, stmts, fm, sector };
  } catch {
    return null;
  }
}
