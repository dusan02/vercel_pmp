const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
    const cmds = [
        'echo "--- PM2 LIST ---"',
        'pm2 list',
        'echo "--- RECENT PM2 ERRORS ---"',
        'tail -n 100 /var/www/premarketprice/logs/pm2/premarketprice-error.log',
        'echo "--- OOM KILLS ---"',
        'dmesg -T | grep -i "out of memory\\|oom" | tail -n 10 || echo "No OOM info"'
    ];
    
    conn.exec(cmds.join(' && '), (err, stream) => {
        let output = '';
        stream.on('close', () => {
           console.log(output);
           conn.end();
        }).on('data', d => output += d).stderr.on('data', d => output += d);
    });
}).connect({ host: '89.185.250.213', port: 22, username: 'root', password: 'CcO15gcCwu' });
