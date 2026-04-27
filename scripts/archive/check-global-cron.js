const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    conn.exec('ls -la /etc/cron.d/ && cat /etc/cron.d/* 2>/dev/null && grep -r "pm2" /etc/cron* 2>/dev/null', (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
