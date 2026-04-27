const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Try multiple possible paths
let dbPath = path.join(__dirname, '../prisma/dev.db');
if (!fs.existsSync(dbPath)) {
  dbPath = path.join(process.cwd(), 'prisma/dev.db');
}
if (!fs.existsSync(dbPath)) {
  console.log('Database file not found. Tried:');
  console.log('  -', path.join(__dirname, '../prisma/dev.db'));
  console.log('  -', path.join(process.cwd(), 'prisma/dev.db'));
  process.exit(1);
}

try {
  const db = new Database(dbPath, { readonly: true });
  
  // First, check what tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('=== Available Tables ===');
  tables.forEach(t => console.log(`  - ${t.name}`));
  console.log('');
  
  // Try to get counts from existing tables
  if (tables.some(t => t.name === 'Ticker')) {
    const tickerCount = db.prepare('SELECT COUNT(*) as count FROM Ticker').get();
    console.log(`Ticker (firmy): ${tickerCount.count}`);
    
    if (tickerCount.count > 0) {
      const sample = db.prepare('SELECT symbol, name, sector FROM Ticker LIMIT 5').all();
      console.log('\n=== Sample Tickers ===');
      sample.forEach(t => {
        console.log(`  ${t.symbol}: ${t.name || 'N/A'} (${t.sector || 'N/A'})`);
      });
    }
  } else {
    console.log('Ticker table does not exist (migration not run yet)');
  }
  
  if (tables.some(t => t.name === 'SessionPrice')) {
    const sessionPriceCount = db.prepare('SELECT COUNT(*) as count FROM SessionPrice').get();
    console.log(`SessionPrice: ${sessionPriceCount.count}`);
  }
  
  if (tables.some(t => t.name === 'DailyRef')) {
    const dailyRefCount = db.prepare('SELECT COUNT(*) as count FROM DailyRef').get();
    console.log(`DailyRef: ${dailyRefCount.count}`);
  }
  
  if (tables.some(t => t.name === 'EarningsCalendar')) {
    const earningsCount = db.prepare('SELECT COUNT(*) as count FROM EarningsCalendar').get();
    console.log(`EarningsCalendar: ${earningsCount.count}`);
  }
  
  // Check old tables
  if (tables.some(t => t.name === 'stocks')) {
    const stocksCount = db.prepare('SELECT COUNT(*) as count FROM stocks').get();
    console.log(`stocks (old table): ${stocksCount.count}`);
  }
  
  db.close();
} catch (error) {
  if (error.code === 'SQLITE_CANTOPEN') {
    console.log('Database file not found or not accessible');
    console.log('Expected path:', dbPath);
  } else {
    console.error('Error:', error.message);
  }
}

