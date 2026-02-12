
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../prisma/dev.db');
const symbol = process.argv[2] || 'AAPL';
console.log(`Checking ${symbol} in ${dbPath}...`);

// Helper to try requiring from multiple paths
function tryRequire(moduleName) {
    try {
        return require(moduleName);
    } catch (e) {
        try {
            return require(path.join(process.cwd(), 'node_modules', moduleName));
        } catch (e2) {
            return null;
        }
    }
}

function runBetterSqlite() {
    const Database = tryRequire('better-sqlite3');
    if (!Database) return false;
    
    console.log('Using better-sqlite3...');
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT * FROM Ticker WHERE symbol = ?').get(symbol);
    console.log(row);
    return true;
}

function runSqlite3() {
    const sqlite3 = tryRequire('sqlite3');
    if (!sqlite3) return false;
    
    console.log('Using sqlite3...');
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) console.error(err.message);
    });
    
    db.get('SELECT * FROM Ticker WHERE symbol = ?', [symbol], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row);
    });
    return true;
}

if (!runBetterSqlite()) {
    console.log('better-sqlite3 failed/missing, trying sqlite3...');
    if (!runSqlite3()) {
        console.error('Both better-sqlite3 and sqlite3 failed to load.');
        console.log('Current directory:', process.cwd());
        console.log('Node modules exists?', fs.existsSync(path.join(process.cwd(), 'node_modules')));
    }
}
