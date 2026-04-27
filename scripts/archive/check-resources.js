const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    conn.exec('free -m && echo "---" && df -h && echo "---" && top -b -n 1 | head -n 20', (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
