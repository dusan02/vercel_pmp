const Database = require('better-sqlite3');
const path = require('path');

function search(dbPath, symbol) {
  console.log(`Searching in ${dbPath}...`);
  try {
    const db = new Database(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    
    for (const table of tables) {
      const tableName = table.name;
      const columns = db.prepare(`PRAGMA table_info("${tableName}")`).all();
      const hasSymbol = columns.some(c => c.name.toLowerCase() === 'symbol' || c.name.toLowerCase() === 'ticker');
      
      if (hasSymbol) {
        const colName = columns.find(c => c.name.toLowerCase() === 'symbol' || c.name.toLowerCase() === 'ticker').name;
        const rows = db.prepare(`SELECT * FROM "${tableName}" WHERE "${colName}" = ?`).all(symbol);
        if (rows.length > 0) {
          console.log(`✅ Found "${symbol}" in table "${tableName}":`);
          console.log(rows);
        }
      }
    }
    db.close();
  } catch (e) {
    console.error(`Error searching ${dbPath}: ${e.message}`);
  }
}

const symbol = 'MNDT';
search(path.join(__dirname, '../prisma/dev.db'), symbol);
search(path.join(__dirname, '../prisma/data/premarket.db'), symbol);
search(path.join(__dirname, '../data/prema.db'), symbol);
