const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    conn.exec('crontab -l || echo "no crontab for root" && tail -n 50 /var/log/syslog | grep CRON || echo "no syslog"', (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
