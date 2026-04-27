const { Client } = require('ssh2');
const fs = require('fs');

const remoteScript = `
const { execSync } = require('child_process');
const fs = require('fs');
try {
  const pm2Info = execSync('pm2 show premarketprice').toString();
  const envInfo = execSync('pm2 env premarketprice').toString();
  fs.writeFileSync('/tmp/pm2_debug.txt', pm2Info + "\\n\\n" + envInfo);
} catch (e) {
  fs.writeFileSync('/tmp/pm2_debug.txt', e.message);
}
`;

fs.writeFileSync('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_pm2_debug.js', remoteScript);

const conn = new Client();
conn.on('ready', () => {
    conn.sftp((err, sftp) => {
        if(err) throw err;
        sftp.fastPut('D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\remote_pm2_debug.js', '/tmp/remote_pm2_debug.js', (uploadErr) => {
            if(uploadErr) throw uploadErr;
            conn.exec('node /tmp/remote_pm2_debug.js', (execErr, stream) => {
                stream.on('close', () => {
                   sftp.fastGet('/tmp/pm2_debug.txt', 'D:\\\\Projects\\\\Vercel_PMP\\\\pmp_prod\\\\scripts\\\\pm2_debug.txt', () => {
                       console.log('Downloaded to pm2_debug.txt!');
                       conn.end();
                   });
                }).on('data', d => console.log(''+d)).stderr.on('data', d => console.error(''+d));
            });
        });
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
