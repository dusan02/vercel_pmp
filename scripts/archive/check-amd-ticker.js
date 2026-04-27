const { Client } = require('ssh2');

const remoteScript = `
const db = require('better-sqlite3')('/var/www/premarketprice/prisma/data/premarket.db');
const row = db.prepare('SELECT * FROM Ticker WHERE symbol = ?').get('AMD');
console.log(JSON.stringify(row, null, 2));
`;

const conn = new Client();
conn.on('ready', () => {
    conn.exec(`node -e "${remoteScript.replace(/"/g, '\\"')}"`, (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
