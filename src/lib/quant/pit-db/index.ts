import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

export class PitDatabase {
    private dbPromise: Promise<Database>;

    constructor(dbPath: string) {
        this.dbPromise = open({ filename: dbPath, driver: sqlite3.Database }).then(async db => {
            await db.exec(`
                CREATE TABLE IF NOT EXISTS SecFilings (
                    accessionNumber TEXT PRIMARY KEY, cik TEXT, formType TEXT, 
                    economicPeriodEnd TEXT, acceptanceDateTime TEXT
                );
                CREATE TABLE IF NOT EXISTS FundamentalObservations (
                    cik TEXT, accessionNumber TEXT, metricName TEXT, value REAL,
                    contextRef TEXT, economicPeriodEnd TEXT, acceptanceDateTime TEXT
                );
                CREATE TABLE IF NOT EXISTS ConsensusEstimates (
                    cik TEXT, metricName TEXT, fiscalPeriod TEXT, 
                    consensusValue REAL, knownAt TEXT
                );
                CREATE TABLE IF NOT EXISTS MarketBars (
                    ticker TEXT, date TEXT, close REAL
                );
            `);
            return db;
        });
    }

    async insertObservation(data: any) {
        const db = await this.dbPromise;
        await db.run(`INSERT INTO FundamentalObservations (cik, accessionNumber, metricName, value, contextRef, economicPeriodEnd, acceptanceDateTime) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [data.cik, data.accessionNumber, data.metricName, data.value, data.contextRef, data.economicPeriodEnd, data.acceptanceDateTime]);
    }

    async insertEstimate(data: any) {
        const db = await this.dbPromise;
        await db.run(`INSERT INTO ConsensusEstimates (cik, metricName, fiscalPeriod, consensusValue, knownAt) VALUES (?, ?, ?, ?, ?)`,
            [data.cik, data.metricName, data.fiscalPeriod, data.consensusValue, data.knownAt]);
    }

    async insertMarketBar(data: any) {
        const db = await this.dbPromise;
        await db.run(`INSERT INTO MarketBars (ticker, date, close) VALUES (?, ?, ?)`,
            [data.ticker, data.date, data.close]);
    }

    // P4.3-SQL Fix: Safe, deterministic PIT Selector using ROW_NUMBER.
    // Avoids MAX() grouping ambiguities. Strictly orders by acceptanceDateTime DESC.
    async getAllFundamentalsAsKnownAt(cik: string, metricNames: string[], targetInstant: string) {
        const db = await this.dbPromise;
        const placeholders = metricNames.map(() => '?').join(',');
        
        const rows = await db.all(`
            SELECT * FROM (
                SELECT *, 
                       ROW_NUMBER() OVER(PARTITION BY metricName, economicPeriodEnd ORDER BY acceptanceDateTime DESC) as rn
                FROM FundamentalObservations
                WHERE cik = ? AND metricName IN (${placeholders}) AND acceptanceDateTime <= ?
            )
            WHERE rn = 1
            ORDER BY economicPeriodEnd DESC
        `, [cik, ...metricNames, targetInstant]);
        return rows;
    }

    async getEstimatesAsKnownAt(cik: string, metricName: string, fiscalPeriod: string, targetInstant: string) {
        const db = await this.dbPromise;
        // Retrieves the entire revision history known up to targetInstant
        const rows = await db.all(`
            SELECT * FROM ConsensusEstimates
            WHERE cik = ? AND metricName = ? AND fiscalPeriod = ? AND knownAt <= ?
            ORDER BY knownAt DESC
        `, [cik, metricName, fiscalPeriod, targetInstant]);
        return rows;
    }

    async getMarketBarsInRange(ticker: string, startDate: string, endDate: string) {
        const db = await this.dbPromise;
        return await db.all(`
            SELECT * FROM MarketBars
            WHERE ticker = ? AND date >= ? AND date <= ?
            ORDER BY date DESC
        `, [ticker, startDate, endDate]);
    }

    async close() {
        const db = await this.dbPromise;
        await db.close();
    }
}
