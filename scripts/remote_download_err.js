
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  fs.writeFileSync('/var/www/premarketprice/scripts/prisma_err.txt', errLog.slice(-10000));
} catch(e) { console.error(e.message); }
