const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    const remoteScript = \`
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  const lines = errLog.split('\\n');
  const recentLines = lines.slice(-300);
  const errors = recentLines.filter(l => l.includes('Error') || l.includes('prisma') || l.includes('Exception') || l.includes('Fatal'));
  console.log('--- CRASH LOGS ---');
  console.log(errors.join('\\n').slice(0, 3000));
} catch(e) { console.error(e); }
\`;
    conn.exec(\`node -e "\${remoteScript.replace(/\"/g, '\\\\"')}"\`, (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
