const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    conn.exec('cat /etc/crontab && echo "---" && getent passwd | cut -d: -f1 | sort | xargs -I {} -n 1 bash -c "echo {} && crontab -u {} -l 2>/dev/null"', (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
