import { Client } from 'ssh2';
import * as fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
    const cmd = `
        echo "=== PREMARKETPRICE ERROR ==="
        tail -n 200 /var/www/premarketprice/logs/pm2/premarketprice-error.log
        echo "=== PREMARKETPRICE OUT ==="
        tail -n 200 /var/www/premarketprice/logs/pm2/premarketprice-out.log
        echo "=== PM2 STATUS ==="
        pm2 status premarketprice
    `;
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('close', (code, signal) => {
            fs.writeFileSync('ssh-out4.log', out);
            console.log('Saved to ssh-out4.log');
            conn.end();
            process.exit(0);
        }).on('data', (data) => {
            out += data.toString();
        }).stderr.on('data', (data) => {
            out += data.toString();
        });
    });
}).connect({
    host: '89.185.250.213',
    port: 22,
    username: 'root',
    password: 'CcO15gcCwu'
});
