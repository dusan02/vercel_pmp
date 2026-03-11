const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = \`
const { execSync } = require('child_process');
try {
  let output = execSync('grep -A 10 -B 5 "P2022" /var/www/premarketprice/logs/pm2/premarketprice-error.log | tail -n 100').toString();
  require('fs').writeFileSync('/tmp/prisma_err.txt', output);
} catch(e) {}
\`;

const conn = new Client();
conn.on('ready', () => {
    conn.exec(\`node -e "\${remoteScript.replace(/\"/g, '\\\\"')}"\`, (err, stream) => {
        stream.on('close', () => {
            conn.sftp((sftpErr, sftp) => {
                sftp.fastGet('/tmp/prisma_err.txt', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\prisma_err.txt', () => {
                   console.log('Downloaded to prisma_err.txt');
                   conn.end();
                });
            });
        }).on('data', d => {}).stderr.on('data', d => {});
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
