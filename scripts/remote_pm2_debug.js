
const { execSync } = require('child_process');
const fs = require('fs');
try {
  const pm2Info = execSync('pm2 show premarketprice').toString();
  const envInfo = execSync('pm2 env premarketprice').toString();
  fs.writeFileSync('/tmp/pm2_debug.txt', pm2Info + "\n\n" + envInfo);
} catch (e) {
  fs.writeFileSync('/tmp/pm2_debug.txt', e.message);
}
