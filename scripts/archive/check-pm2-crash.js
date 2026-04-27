const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    conn.exec('pm2 status premarketprice && echo "---" && tail -n 100 /var/www/premarketprice/logs/pm2/premarketprice-error.log', (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
