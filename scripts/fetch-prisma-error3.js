const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = `
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  fs.writeFileSync('/var/www/premarketprice/scripts/prisma_err.txt', errLog.slice(-10000));
} catch(e) { console.error(e.message); }
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_download_err.js', remoteScript);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_download_err.js', '/var/www/premarketprice/scripts/remote_download_err.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('cd /var/www/premarketprice && node scripts/remote_download_err.js', (execErr, stream) => {
                stream.on('close', () => {
                   sftp.fastGet('/var/www/premarketprice/scripts/prisma_err.txt', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\prisma_err.txt', () => {
                       console.log('Downloaded to prisma_err.txt!');
                       conn.end();
                   });
                }).on('data', d => console.log(''+d)).stderr.on('data', d => console.error(''+d));
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
