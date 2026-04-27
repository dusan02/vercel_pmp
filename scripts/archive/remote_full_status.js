
const { execSync } = require('child_process');
const fs = require('fs');

try {
  const pm2Info = execSync('pm2 show premarketprice || pm2 list').toString();
  const pm2Logs = execSync('tail -n 250 /var/www/premarketprice/logs/pm2/premarketprice-error.log').toString();
  const oomKills = execSync('dmesg -T | grep -i "out of memory\|oom" | tail -n 50 || echo "no oom"').toString();
  
  fs.writeFileSync('/tmp/full_status.txt', "=== PM2 INFO ===\n" + pm2Info + "\n\n=== PM2 LOGS ===\n" + pm2Logs + "\n\n=== OOMS ===\n" + oomKills);
} catch (e) {
  fs.writeFileSync('/tmp/full_status.txt', e.message);
}
