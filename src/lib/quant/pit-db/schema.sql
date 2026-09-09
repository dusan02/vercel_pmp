CREATE TABLE IF NOT EXISTS SecFilings (
    accessionNumber TEXT PRIMARY KEY,
    cik TEXT NOT NULL,
    formType TEXT NOT NULL,
    isAmended INTEGER NOT NULL,
    economicPeriodEnd TEXT NOT NULL,
    acceptanceDateTime TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS FundamentalObservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cik TEXT NOT NULL,
    accessionNumber TEXT NOT NULL,
    metricName TEXT NOT NULL,
    value REAL NOT NULL,
    contextRef TEXT NOT NULL,
    acceptanceDateTime TEXT NOT NULL,
    FOREIGN KEY(accessionNumber) REFERENCES SecFilings(accessionNumber)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_cik_period ON FundamentalObservations(cik, metricName);
