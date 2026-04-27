import { Client } from 'ssh2';
import * as fs from 'fs';

const conn = new Client();
conn.on('ready', () => {
    const cmd = `
        echo "=== PM2 STATUS ==="
        pm2 status
        echo "=== PM2 LOGS ==="
        pm2 logs --lines 50 --nostream
        echo "=== ERROR LOGS ==="
        cat /root/.pm2/logs/pmp-prod-error.log | tail -n 50
        cat /root/.pm2/logs/premarketprice-error.log | tail -n 50
    `;
    
    conn.exec(cmd, (err, stream) => {
        if (err) throw err;
        let out = '';
        stream.on('close', (code, signal) => {
            fs.writeFileSync('ssh-out.log', out);
            console.log('Saved to ssh-out.log');
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
