
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  const lines = errLog.split('\n');
  const recentLines = lines.slice(-400);
  const errors = recentLines.filter(l => l.includes('Error') || l.includes('prisma') || l.includes('Exception') || l.includes('Fatal'));
  console.log('--- CRASH LOGS ---');
  console.log(errors.join('\n').slice(0, 3000));
} catch(e) { console.error('Script Error:', e.message); }
