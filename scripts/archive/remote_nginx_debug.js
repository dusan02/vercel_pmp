
const { execSync } = require('child_process');
const fs = require('fs');

try {
  let nginxErr = '';
  try { nginxErr = execSync('tail -n 100 /var/log/nginx/error.log').toString(); } catch(e) {}
  
  let oomKills = '';
  try { oomKills = execSync('dmesg -T | grep -i "out of memory\|oom" | tail -n 50').toString(); } catch(e) {}
  
  let result = "=== NGINX ERRORS ===\n" + nginxErr + "\n\n=== OOM KILLS ===\n" + oomKills;
  fs.writeFileSync('/tmp/nginx_debug.txt', (result || 'No errors found.'));
} catch (err) {
  fs.writeFileSync('/tmp/nginx_debug.txt', err.message);
}
