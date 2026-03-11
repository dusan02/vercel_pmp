const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = `
const { execSync } = require('child_process');
const fs = require('fs');

try {
  const pm2Info = execSync('pm2 show premarketprice || pm2 list').toString();
  const pm2Logs = execSync('tail -n 250 /var/www/premarketprice/logs/pm2/premarketprice-error.log').toString();
  const oomKills = execSync('dmesg -T | grep -i "out of memory\\\|oom" | tail -n 50 || echo "no oom"').toString();
  
  fs.writeFileSync('/tmp/full_status.txt', "=== PM2 INFO ===\\n" + pm2Info + "\\n\\n=== PM2 LOGS ===\\n" + pm2Logs + "\\n\\n=== OOMS ===\\n" + oomKills);
} catch (e) {
  fs.writeFileSync('/tmp/full_status.txt', e.message);
}
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_full_status.js', remoteScript);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_full_status.js', '/tmp/remote_full_status.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('node /tmp/remote_full_status.js', (execErr, stream) => {
                stream.on('close', () => {
                   sftp.fastGet('/tmp/full_status.txt', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\full_status.txt', () => {
                       console.log('Downloaded to full_status.txt!');
                       conn.end();
                   });
                }).on('data', d => console.log(''+d)).stderr.on('data', d => console.error(''+d));
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
