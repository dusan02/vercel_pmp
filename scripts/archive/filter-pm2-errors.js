const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  const script = `
const fs = require('fs');
try {
  const errLog = fs.readFileSync('/var/www/premarketprice/logs/pm2/premarketprice-error.log', 'utf8');
  const lines = errLog.split('\\n');
  const recentLines = lines.slice(-200); // look at last 200 lines
  const errors = recentLines.filter(l => l.includes('Error') || l.includes('prisma') || l.includes('Exception'));
  console.log('--- ERROR LOG FILTERED ---');
  console.log(errors.join('\\n'));
} catch(e) { console.error(e); }
  `;
  
  conn.exec(`node -e "${script.replace(/"/g, '\\"')}"`, (err, stream) => {
    let output = '';
    stream.on('close', () => {
      console.log(output);
      conn.end();
    }).on('data', d => output += d).stderr.on('data', d => output += d);
  });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
