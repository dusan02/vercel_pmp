const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = `
const { execSync } = require('child_process');
const fs = require('fs');

try {
  let nginxErr = '';
  try { nginxErr = execSync('tail -n 100 /var/log/nginx/error.log').toString(); } catch(e) {}
  
  let oomKills = '';
  try { oomKills = execSync('dmesg -T | grep -i "out of memory\\\|oom" | tail -n 50').toString(); } catch(e) {}
  
  let result = "=== NGINX ERRORS ===\\n" + nginxErr + "\\n\\n=== OOM KILLS ===\\n" + oomKills;
  fs.writeFileSync('/tmp/nginx_debug.txt', (result || 'No errors found.'));
} catch (err) {
  fs.writeFileSync('/tmp/nginx_debug.txt', err.message);
}
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_nginx_debug.js', remoteScript);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_nginx_debug.js', '/tmp/remote_nginx_debug.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('node /tmp/remote_nginx_debug.js', (execErr, stream) => {
                stream.on('close', () => {
                   sftp.fastGet('/tmp/nginx_debug.txt', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\nginx_debug.txt', () => {
                       console.log('Downloaded to nginx_debug.txt!');
                       conn.end();
                   });
                }).on('data', d => console.log(''+d)).stderr.on('data', d => console.error(''+d));
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
