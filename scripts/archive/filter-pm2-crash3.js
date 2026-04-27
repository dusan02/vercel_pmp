const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = `
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  const lines = errLog.split('\\n');
  const recentLines = lines.slice(-400);
  const errors = recentLines.filter(l => l.includes('Error') || l.includes('prisma') || l.includes('Exception') || l.includes('Fatal'));
  console.log('--- CRASH LOGS ---');
  console.log(errors.join('\\n').slice(0, 3000));
} catch(e) { console.error('Script Error:', e.message); }
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_filter.js', remoteScript);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_filter.js', '/var/www/premarketprice/scripts/remote_filter.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('cd /var/www/premarketprice && node scripts/remote_filter.js', (execErr, stream) => {
                if(execErr) throw execErr;
                let output = '';
                stream.on('close', () => {
                   console.log('Done!');
                   console.log(output);
                   conn.end();
                }).on('data', d => output += d).stderr.on('data', d => output += d);
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
